"""
Waste image classifier for the AI sorting assistant (runs on the phone, offline).

Data (public, downloaded by scripts in this folder):
  - TrashNet (garythung/trashnet, MIT): cardboard, glass, metal, paper, plastic, trash
  - Garbage Classification 12 classes (Kaggle mirror on Hugging Face, ODbL): adds biological (organic), etc.
Mapped to the app's six classes: organic, plastic, paper, metal, glass, other.

Method: transfer learning on MobileNetV2 (ImageNet). Stage 1 trains a new head on a frozen backbone,
stage 2 fine-tunes the top of the backbone with a low learning rate. Evaluated on a held-out,
stratified test split, then exported to TensorFlow Lite (float16) for react-native-fast-tflite.

Usage: .venv/bin/python train_classifier.py [--max-per-class 2000] [--epochs-head 6] [--epochs-fine 3]
Local photos: put extra images in data/local/<class>/ (e.g. photos taken by pilot users) — they are added automatically.
"""
import argparse
import json
import random
import shutil
import time
import zipfile
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).parent
RAW = ROOT / "data" / "raw"
IMAGES = ROOT / "data" / "images"
LOCAL = ROOT / "data" / "local"
OUT = ROOT / "artifacts"
CLASSES = ["organic", "plastic", "paper", "metal", "glass", "other"]  # must match packages/shared/src/sorting.ts
MAP = {
    "biological": "organic", "organic": "organic",
    "plastic": "plastic",
    "paper": "paper", "cardboard": "paper",
    "metal": "metal",
    "glass": "glass", "brown-glass": "glass", "green-glass": "glass", "white-glass": "glass",
    "trash": "other", "battery": "other", "clothes": "other", "shoes": "other",
}
IMG = 224
SEED = 42


def extract(max_per_class: int) -> dict:
    if IMAGES.exists():
        shutil.rmtree(IMAGES)
    for c in CLASSES:
        (IMAGES / c).mkdir(parents=True)
    pools: dict[str, list[tuple[zipfile.ZipFile, zipfile.ZipInfo]]] = {c: [] for c in CLASSES}
    zips = [zipfile.ZipFile(z) for z in RAW.glob("*/*.zip")]
    for zf in zips:
        for info in zf.infolist():
            name = info.filename.lower()
            if info.is_dir() or not name.endswith((".jpg", ".jpeg", ".png")) or "__macosx" in name:
                continue
            parts = Path(info.filename).parts
            folder = parts[-2].lower() if len(parts) >= 2 else ""
            target = MAP.get(folder)
            if target:
                pools[target].append((zf, info))
    rng = random.Random(SEED)
    counts = {}
    for c, items in pools.items():
        rng.shuffle(items)
        chosen = items[:max_per_class]
        for i, (zf, info) in enumerate(chosen):
            ext = Path(info.filename).suffix.lower()
            (IMAGES / c / f"{i:05d}{ext}").write_bytes(zf.read(info))
        counts[c] = {"available": len(items), "used": len(chosen)}
    if LOCAL.exists():  # locally collected photos from the pilot
        for c in CLASSES:
            for i, p in enumerate(sorted((LOCAL / c).glob("*"))):
                if p.suffix.lower() in (".jpg", ".jpeg", ".png"):
                    shutil.copy(p, IMAGES / c / f"local_{i:05d}{p.suffix.lower()}")
                    counts[c]["local"] = counts[c].get("local", 0) + 1
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-per-class", type=int, default=2000)
    ap.add_argument("--epochs-head", type=int, default=6)
    ap.add_argument("--epochs-fine", type=int, default=3)
    args = ap.parse_args()

    import tensorflow as tf
    from sklearn.metrics import classification_report, confusion_matrix
    from sklearn.model_selection import train_test_split

    tf.keras.utils.set_random_seed(SEED)
    OUT.mkdir(exist_ok=True)
    t0 = time.time()
    counts = extract(args.max_per_class)
    print("dataset:", json.dumps(counts))

    files, labels = [], []
    for ci, c in enumerate(CLASSES):
        for p in sorted((IMAGES / c).glob("*")):
            files.append(str(p)); labels.append(ci)
    f_train, f_test, y_train, y_test = train_test_split(files, labels, test_size=0.15, stratify=labels, random_state=SEED)
    f_train, f_val, y_train, y_val = train_test_split(f_train, y_train, test_size=0.12, stratify=y_train, random_state=SEED)
    print(f"train {len(f_train)}  val {len(f_val)}  test {len(f_test)}")

    def load(path, label):
        img = tf.io.decode_image(tf.io.read_file(path), channels=3, expand_animations=False)
        img = tf.image.resize(img, (IMG, IMG))
        return tf.cast(img, tf.float32), label

    augment = tf.keras.Sequential([
        tf.keras.layers.RandomFlip("horizontal"),
        tf.keras.layers.RandomRotation(0.08),
        tf.keras.layers.RandomZoom(0.12),
        tf.keras.layers.RandomContrast(0.15),
    ])

    def ds(f, y, train):
        d = tf.data.Dataset.from_tensor_slices((f, y))
        if train:
            d = d.shuffle(len(f), seed=SEED)
        d = d.map(load, num_parallel_calls=tf.data.AUTOTUNE).batch(32)
        if train:
            d = d.map(lambda x, l: (augment(x, training=True), l), num_parallel_calls=tf.data.AUTOTUNE)
        return d.prefetch(tf.data.AUTOTUNE)

    train_ds, val_ds, test_ds = ds(f_train, y_train, True), ds(f_val, y_val, False), ds(f_test, y_test, False)

    # Model input: raw RGB 0..255 float32 [1,224,224,3]; preprocessing is inside the model (phone sends raw pixels)
    base = tf.keras.applications.MobileNetV2(input_shape=(IMG, IMG, 3), include_top=False, weights="imagenet")
    base.trainable = False
    inputs = tf.keras.Input((IMG, IMG, 3))
    x = tf.keras.layers.Rescaling(1 / 127.5, offset=-1)(inputs)
    x = base(x, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(0.25)(x)
    outputs = tf.keras.layers.Dense(len(CLASSES), activation="softmax")(x)
    model = tf.keras.Model(inputs, outputs)

    freq = Counter(y_train)
    class_weight = {i: len(y_train) / (len(CLASSES) * freq[i]) for i in range(len(CLASSES))}

    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    model.fit(train_ds, validation_data=val_ds, epochs=args.epochs_head, class_weight=class_weight, verbose=2)

    base.trainable = True
    for layer in base.layers[:-40]:
        layer.trainable = False
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-5), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    model.fit(train_ds, validation_data=val_ds, epochs=args.epochs_fine, class_weight=class_weight, verbose=2,
              callbacks=[tf.keras.callbacks.EarlyStopping(patience=2, restore_best_weights=True)])

    probs = model.predict(test_ds, verbose=0)
    pred = probs.argmax(1)
    report = classification_report(y_test, pred, target_names=CLASSES, output_dict=True, zero_division=0)
    cm = confusion_matrix(y_test, pred).tolist()
    print(classification_report(y_test, pred, target_names=CLASSES, zero_division=0))

    model.save(OUT / "waste_classifier.keras")
    conv = tf.lite.TFLiteConverter.from_keras_model(model)
    conv.optimizations = [tf.lite.Optimize.DEFAULT]
    conv.target_spec.supported_types = [tf.float16]
    tfl = conv.convert()
    (OUT / "waste_classifier.tflite").write_bytes(tfl)

    # TFLite sanity check + CPU latency on this machine (phone latency is measured in the app)
    interp = tf.lite.Interpreter(model_content=tfl)
    interp.allocate_tensors()
    inp, out = interp.get_input_details()[0], interp.get_output_details()[0]
    agree, times = 0, []
    sample = list(zip(f_test, y_test))[:200]
    for path, _ in sample:
        img, _ = load(path, 0)
        interp.set_tensor(inp["index"], img[None, ...].numpy())
        s = time.perf_counter(); interp.invoke(); times.append((time.perf_counter() - s) * 1000)
        agree += int(interp.get_tensor(out["index"])[0].argmax() == model(img[None, ...], training=False).numpy()[0].argmax())

    metrics = {
        "classes": CLASSES,
        "dataset": counts,
        "split": {"train": len(f_train), "val": len(f_val), "test": len(f_test)},
        "test_accuracy": report["accuracy"],
        "macro_f1": report["macro avg"]["f1-score"],
        "per_class": {c: {k: round(v, 4) for k, v in report[c].items()} for c in CLASSES},
        "confusion_matrix": cm,
        "tflite_size_kb": round(len(tfl) / 1024),
        "tflite_keras_agreement": agree / len(sample),
        "tflite_cpu_ms_median_dev_machine": float(np.median(times)),
        "input": {"shape": [1, IMG, IMG, 3], "dtype": "float32", "range": "0..255 RGB"},
        "train_minutes": round((time.time() - t0) / 60, 1),
    }
    (OUT / "classifier_metrics.json").write_text(json.dumps(metrics, indent=2))
    (OUT / "classifier_labels.json").write_text(json.dumps(CLASSES))
    print(json.dumps({k: metrics[k] for k in ("test_accuracy", "macro_f1", "tflite_size_kb", "tflite_keras_agreement", "train_minutes")}, indent=2))


if __name__ == "__main__":
    main()
