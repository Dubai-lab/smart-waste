"""
Demand prediction ("virtual smart bin"): will this household's bin be full/overflowing on day D?

Labels come from the crews: every QR scan records the bin fill level. Features come from the SAME SQL function
the API uses at prediction time (public.demand_features via public.demand_training_set), so training and serving match.

Compares logistic regression, random forest and gradient boosting (scikit-learn). Exports the chosen model as
JSON that the Node API evaluates (apps/api/src/services/demand.ts), verifies that the JSON evaluator reproduces
scikit-learn's probabilities, and uploads it to public.ml_models.

Simulated history (allowed by the proposal while real records are few) is generated in memory with --simulate N.
It is ONLY added to the training split, never written to the database, and all reported metrics use REAL pickups.

Usage:
  .venv/bin/python train_demand.py                       # real data only
  .venv/bin/python train_demand.py --simulate 300        # + simulated history for 300 virtual households
  .venv/bin/python train_demand.py --simulate 300 --upload --activate
"""
import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).parent
OUT = ROOT / "artifacts"
FEATURES = [  # order must match apps/api/src/services/demand.ts FEATURES
    "household_size", "days_since_pickup", "reports_since_pickup", "extra_requested", "dow", "is_weekend",
    "holiday_recent", "umuganda_recent", "last_fill", "avg_fill", "fill_rate", "expected_fill", "history_n",
]


def env():
    for line in (ROOT.parent / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def load_real(sb) -> pd.DataFrame:
    rows = sb.rpc("demand_training_set").execute().data or []
    df = pd.DataFrame(rows)
    if df.empty:
        return pd.DataFrame(columns=FEATURES + ["label", "pickup_date", "is_simulated"])
    return df[~df["is_simulated"]].copy()


def simulate(n_households: int, days: int = 120, seed: int = 7) -> pd.DataFrame:
    """Virtual households: daily waste generation ~ size, weekends +20%, after holidays/Umuganda +30%.
    Crews come every 3–5 days; residents report when the bin looks full (60%). Fill scale 0..4."""
    rng = np.random.default_rng(seed)
    start = dt.date(2026, 6, 1)
    out = []
    for h in range(n_households):
        size = int(rng.integers(1, 9))
        rate = size * rng.uniform(0.07, 0.16)
        fill, last_pick, history, rep, extra = 0.0, -int(rng.integers(1, 5)), [], 0, 0
        next_visit = int(rng.integers(2, 5))
        for d in range(days):
            date = start + dt.timedelta(days=d)
            dow = date.isoweekday()
            umu = dow == 6 and (date + dt.timedelta(days=7)).month != date.month
            mult = 1.2 if dow >= 6 else 1.0
            mult *= 1.3 if umu else 1.0
            fill = min(4.5, fill + rate * mult * rng.uniform(0.6, 1.4))
            if fill >= 3 and rng.random() < 0.6:
                rep += 1
            if rng.random() < 0.01:
                extra += 1
            if d >= next_visit:
                gaps = [history[i][0] - history[i - 1][0] for i in range(1, len(history))][-5:]
                scores = [s for _, s in history][-5:]
                fr = (np.mean([s / max(g, 0.5) for s, g in zip(scores[1:], gaps)]) if gaps else -1)
                since = min(d - last_pick, 30)
                out.append({
                    "household_size": size, "days_since_pickup": since, "reports_since_pickup": rep, "extra_requested": extra,
                    "dow": dow, "is_weekend": int(dow >= 6), "holiday_recent": 0,
                    "umuganda_recent": int(any((date - dt.timedelta(days=k)).isoweekday() == 6 and ((date - dt.timedelta(days=k)) + dt.timedelta(days=7)).month != (date - dt.timedelta(days=k)).month for k in (1, 2, 3))),
                    "last_fill": history[-1][1] if history else -1, "avg_fill": float(np.mean(scores)) if scores else -1,
                    "fill_rate": float(fr), "expected_fill": float(min(fr * since, 8)) if fr >= 0 else -1,
                    "history_n": len(history), "label": int(round(fill) >= 3),
                })
                history.append((d, min(4, int(round(fill)))))
                fill, last_pick, rep, extra = 0.0, d, 0, 0
                next_visit = d + int(rng.integers(3, 6))
    return pd.DataFrame(out)


def export_logreg(model, scaler):
    return {"intercept": float(model.intercept_[0]), "coef": model.coef_[0].tolist(),
            "mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist()}


def tree_arrays(t, kind):
    tr = t.tree_
    if kind == "random_forest":
        v = tr.value[:, 0, :]
        value = (v[:, 1] / np.maximum(v.sum(1), 1e-12)).tolist()   # P(class 1) at each node
    else:
        value = tr.value[:, 0, 0].tolist()                           # regression leaf (log-odds update)
    return {"children_left": tr.children_left.tolist(), "children_right": tr.children_right.tolist(),
            "feature": tr.feature.tolist(), "threshold": tr.threshold.tolist(), "value": value}


def export_trees(model, X):
    if isinstance(model, RandomForestClassifier):
        return {"kind": "random_forest", "trees": [tree_arrays(t, "random_forest") for t in model.estimators_]}
    init = float(model._raw_predict_init(X[:1])[0, 0])
    return {"kind": "gradient_boosting", "init": init, "learning_rate": model.learning_rate,
            "trees": [tree_arrays(t, "gradient_boosting") for t in model.estimators_[:, 0]]}


def json_predict(fmt, payload, X):
    """Mirror of the TypeScript evaluator, used to prove the export is exact."""
    if fmt == "logreg":
        z = payload["intercept"] + ((X - np.array(payload["mean"])) / np.array(payload["scale"])) @ np.array(payload["coef"])
        return 1 / (1 + np.exp(-z))
    def leaf(t, x):
        n = 0
        while t["children_left"][n] != -1:
            n = t["children_left"][n] if x[t["feature"][n]] <= t["threshold"][n] else t["children_right"][n]
        return t["value"][n]
    out = []
    for x in X.astype(np.float32):  # scikit-learn trees compare float32 inputs
        s = sum(leaf(t, x) for t in payload["trees"])
        out.append(s / len(payload["trees"]) if payload["kind"] == "random_forest"
                   else 1 / (1 + math.exp(-(payload["init"] + payload["learning_rate"] * s))))
    return np.array(out)


def metrics(y, p, thr=0.5):
    pred = (p >= thr).astype(int)
    m = {"accuracy": accuracy_score(y, pred), "precision": precision_score(y, pred, zero_division=0),
         "recall": recall_score(y, pred, zero_division=0), "f1": f1_score(y, pred, zero_division=0), "n": int(len(y))}
    m["roc_auc"] = roc_auc_score(y, p) if len(set(y)) > 1 else None
    return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in m.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--simulate", type=int, default=0, help="virtual households of simulated history (training only)")
    ap.add_argument("--min-real", type=int, default=40)
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--activate", action="store_true")
    args = ap.parse_args()

    sb = env()
    real = load_real(sb)
    print(f"real labelled pickups: {len(real)}")
    if len(real) and real["label"].nunique() < 2:
        print("real data has a single class so far — collect more varied fill levels")
    has_real_test = len(real) >= args.min_real and real["label"].nunique() == 2

    if has_real_test:
        real = real.sort_values("pickup_date")
        cut = int(len(real) * 0.7)                    # time-based split: train on the past, test on the most recent 30%
        real_train, real_test = real.iloc[:cut], real.iloc[cut:]
    else:
        real_train, real_test = real, real.iloc[0:0]
    sim = simulate(args.simulate) if args.simulate else pd.DataFrame(columns=FEATURES + ["label"])
    train = pd.concat([real_train[FEATURES + ["label"]], sim[FEATURES + ["label"]]], ignore_index=True).astype(float)
    if len(train) < 30 or train["label"].nunique() < 2:
        raise SystemExit("Not enough labelled data to train. Record more pickups (with fill levels) or use --simulate.")

    X, y = train[FEATURES].values, train["label"].astype(int).values
    X_tr, X_val, y_tr, y_val = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)
    if has_real_test:
        X_test, y_test, test_name = real_test[FEATURES].astype(float).values, real_test["label"].astype(int).values, "real (most recent 30%)"
    else:
        X_test, y_test, test_name = X_val, y_val, "validation split (no real test set yet)"

    scaler = StandardScaler().fit(X_tr)
    candidates = {
        "logistic_regression": LogisticRegression(max_iter=2000, class_weight="balanced"),
        "random_forest": RandomForestClassifier(n_estimators=60, max_depth=8, min_samples_leaf=5, class_weight="balanced", random_state=42, n_jobs=-1),
        "gradient_boosting": GradientBoostingClassifier(n_estimators=120, max_depth=3, learning_rate=0.08, random_state=42),
    }
    results = {}
    for name, m in candidates.items():
        m.fit(scaler.transform(X_tr) if name == "logistic_regression" else X_tr, y_tr)
        pv = m.predict_proba(scaler.transform(X_val) if name == "logistic_regression" else X_val)[:, 1]
        pt = m.predict_proba(scaler.transform(X_test) if name == "logistic_regression" else X_test)[:, 1]
        results[name] = {"validation": metrics(y_val, pv), "test": metrics(y_test, pt)}
        print(f"{name:20s} val F1 {results[name]['validation']['f1']:.3f}  test F1 {results[name]['test']['f1']:.3f}  AUC {results[name]['test']['roc_auc']}")

    best = max(results, key=lambda k: results[k]["validation"]["f1"])
    model = candidates[best]
    if best == "logistic_regression":
        fmt, payload = "logreg", export_logreg(model, scaler)
        ref = model.predict_proba(scaler.transform(X_test))[:, 1]
    else:
        fmt, payload = "trees", export_trees(model, X_tr)
        ref = model.predict_proba(X_test)[:, 1]
    diff = float(np.max(np.abs(json_predict(fmt, payload, X_test) - ref))) if len(X_test) else 0.0
    assert diff < 1e-6, f"exported model does not match scikit-learn (max diff {diff})"

    version = f"demand-{best.split('_')[0]}-{dt.datetime.now().strftime('%Y%m%d%H%M')}"
    report = {
        "version": version, "chosen": best, "export_max_abs_diff": diff, "test_set": test_name,
        "rows": {"real_total": int(len(real)), "real_train": int(len(real_train)), "real_test": int(len(real_test)), "simulated_train": int(len(sim))},
        "comparison": results,
    }
    OUT.mkdir(exist_ok=True)
    # fixture for the API's TypeScript evaluator test (apps/api/test/demand.test.ts)
    (OUT / "demand_parity.json").write_text(json.dumps({"format": fmt, "payload": payload, "features": FEATURES,
        "X": X_test[:200].tolist(), "expected": ref[:200].tolist()}))
    (OUT / "demand_report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in ("version", "chosen", "test_set", "rows")}, indent=2))

    if args.upload:
        t = results[best]["test"]
        sb.table("ml_models").insert({
            "name": "demand", "version": version, "algorithm": best, "format": fmt, "payload": payload, "features": FEATURES,
            "metrics": {**t, "test_set": test_name, "simulated_train_rows": int(len(sim)), "comparison": results},
            "trained_rows": int(len(train)), "active": False,
        }).execute()
        if args.activate:
            sb.table("ml_models").update({"active": False}).eq("name", "demand").neq("version", version).execute()
            sb.table("ml_models").update({"active": True}).eq("version", version).execute()
        print("uploaded" + (" and activated" if args.activate else ""))


if __name__ == "__main__":
    main()
