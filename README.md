# Smart Household Waste Collection Management System

A demand-driven household waste collection platform for Kigali that needs no hardware: residents report full bins, a model predicts which other bins are full, routes are optimised daily on real roads, every pickup is proven with QR + GPS + time, and sorting is rewarded with green points that reduce the monthly fee.

Final year project (BSc ISM, 2026/2027). Everything runs on free tiers. Mobile Money and USSD use **sandbox (test) mode**; no real money moves.

## Try it

- **Website (admin dashboard):** https://smart-waste-pi.vercel.app
- **Mobile app:** on the website, tap **Get the app**. Android: install the APK. iPhone: test build (.ipa), installed with a sideloading tool and an Apple ID.

### Demo accounts

All six use the password **`Demo-e4bdd197`**.

| Role | Email | Where to sign in | What to try |
|---|---|---|---|
| Admin | `admin@smartwaste.demo` | Website | Households (map search, QR stickers), Routes & planning, Zones & fleet, Billing, Analytics, Authority view, Users & roles, Settings |
| Household | `household@smartwaste.demo` | Mobile app | Home, report a full bin, sorting assistant (camera), My QR, invoices and **Pay** (MoMo sandbox), leaderboard, complaints |
| Crew | `crew@smartwaste.demo` | Mobile app | Today's route, scan a household QR (needs GPS within 50 m of the house), offline sync |
| Manager | `manager@smartwaste.demo` | Website | Day-to-day operations: overview, routes & planning, households, proof of service, complaints, billing, zones & fleet, recyclables, analytics |
| Officer | `officer@smartwaste.demo` | Website | Local authority for **Kimironko** sector: authority dashboard (service heatmap, illegal dumping, forecast), proof of service, complaints, analytics |
| Recycler | `recycler@smartwaste.demo` | Website | Marketplace: browse and claim sorted recyclables that households list |

The demo setup is one zone (*Demo zone Kimironko*), one crew, one truck (*RAD 001 D*) and one house (*Demo house 1, KG 11 Ave*); there is no activity history yet.

- **Crew route:** a route appears once the admin runs **Routes & planning → Predict & optimise**, or after the daily planning job.
- **Testing a QR scan away from Kimironko:** as admin, edit *Demo house 1* and move its pin to where you are (search a place or use **My location**), then scan its QR as crew.
- **Everything else** (new households registering, recyclers, billing for many houses, SMS to real numbers) needs **real user registrations**. Sign up from the mobile app (household) or the website (recycler). SMS is limited to verified numbers while the Infobip account is on its free trial.
- **Before a real pilot**, change or delete the demo accounts, the admin one above all, because this password is public.

## What is in the box

| Part | Folder | Stack |
|---|---|---|
| Web dashboard (managers, officers, admins, recyclers) | `apps/web` | React 19, Vite, TypeScript, Tailwind v4, React Query, Leaflet/OpenStreetMap, Recharts, Motion |
| Mobile app (households + collection crews) | `apps/mobile` | Expo SDK 58, React Native, Expo Router, SQLite (offline), Camera, Location, Notifications, TFLite |
| API (payments, USSD, route planning, admin) | `apps/api` | Node 22, Express 5, TypeScript, Zod |
| Shared types, validation, translations | `packages/shared` | TypeScript |
| Database, auth, realtime, storage, cron | `supabase/migrations` | Supabase Postgres 17 + PostGIS, RLS on every table, pg_cron, pg_net |
| Machine learning | `ml` | Python 3.12, scikit-learn (demand), TensorFlow/MobileNetV2 → TFLite (sorting) |

### The ten innovations and where they live

| # | Feature | Implementation |
|---|---|---|
| 1 | Sensorless demand prediction | `public.demand_features()` (SQL, shared by training and serving) · `ml/train_demand.py` · `apps/api/src/services/demand.ts` |
| 2 | Daily route optimisation | Clarke–Wright + 2-opt/Or-opt CVRP solver on OSRM road distances, compared with the fixed route: `apps/api/src/services/{vrp,planner,osrm}.ts` · cron `daily-planning` |
| 3 | Live truck tracking + arrival alerts | crew GPS → `truck_locations` (Realtime) · trigger sends "truck ~10 min away" |
| 4 | Verifiable proof of service | signed QR (`household_qr_payload`) + GPS geofence + time window in `public.record_pickup()` |
| 5 | Offline-first crew app | SQLite outbox + idempotent `client_id`: `apps/mobile/src/lib/outbox.ts` |
| 6 | USSD and SMS | Africa's Talking USSD callback: `apps/api/src/routes/ussd.ts` (English + Kinyarwanda) · Infobip SMS for households without push: `public.send_sms()` (`supabase/migrations/0013_sms.sql`) |
| 7 | AI sorting assistant | MobileNetV2 TFLite on the phone: `ml/train_classifier.py` · `apps/mobile/src/lib/classifier.ts` |
| 8 | Green points → fee discount | `points_ledger`, `point_rules`, `generate_invoices()` |
| 9 | Recyclables marketplace | `recyclable_listings` · web Marketplace · mobile Recyclables |
| 10 | Local authority dashboard + escalation | `escalate_overdue_complaints()` (every 15 min) · web Authority view (heatmap, dumping map, forecast) |

## Run it locally

Requirements: Node 22+, npm 10+, Python 3.12 (via `uv`) for ML only.

```bash
npm install
npm run build -w @sw/shared
cp .env.example .env          # fill in Supabase keys (already filled on the developer machine)
npm run db:migrate            # applies supabase/migrations through the Management API

npm run dev:api               # http://localhost:8080
npm run dev:web               # http://localhost:5173
cd apps/mobile && npx expo start   # needs a development build for camera/TFLite/push (see below)
```

Environment files (all git-ignored; templates are the `.env.example` files):

- `/.env` — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `SUPABASE_ACCESS_TOKEN` (migrations only), `CRON_SECRET`
- `apps/web/.env.local` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, optional `VITE_APK_URL`
- `apps/mobile/.env` — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` (password-reset links open the website)

## Tests

```bash
npm test -w @sw/api                                    # unit: route solver, demand-model evaluator parity
cd apps/api && npx tsx --env-file=../../.env test/e2e.live.ts       # live: RLS, QR/GPS proof, billing, escalation, marketplace
cd apps/api && npx tsx --env-file=../../.env test/planning.live.ts  # live: prediction + OSRM routing vs fixed route
```

The live tests create temporary users and data in Supabase and delete them afterwards.

## Deploy (free, no custom domain)

1. **GitHub**: push this repository (private is fine).
2. **API on Render**: New → Blueprint → select the repo (`render.yaml`). Fill the env vars. Free services sleep after 15 minutes; the keep-alive workflow and `pg_cron` ping it.
3. **Web on Vercel**: import the repo and set **Root Directory = `apps/web`** (`apps/web/vercel.json` sets the monorepo build, SPA rewrites and security headers). Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (the Render URL).
4. **Tell the database where the API is** (enables the 05:00 daily planning job):
   ```bash
   node scripts/db-apply.mjs --sql "insert into ops.secrets(key,value) values ('api_base_url','https://<your-api>.onrender.com') on conflict (key) do update set value=excluded.value"
   ```
5. **Supabase Auth**: in *Authentication → URL configuration* set the site URL to the Vercel URL and add `https://<your-site>.vercel.app/**` to redirect URLs (currently `http://localhost:5173`). Set `EXPO_PUBLIC_WEB_URL` in the mobile app to the same URL before building the APK. Email is sent through Gmail SMTP (configured in *Authentication → SMTP*).
6. **GitHub** (Settings → Secrets and variables → Actions): secrets `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`; variables `EXPO_PUBLIC_API_URL` (Render URL), `EXPO_PUBLIC_WEB_URL` (Vercel URL). Used by the iOS build and the keep-alive job.
7. **iPhone test build** (free Apple ID, Sideloadly, re-install every 7 days; no push): Actions → *iOS build (unsigned)* → Run workflow → download `SmartWaste-ios`.

### Mobile app (Android APK, no Play Store fee)

```bash
cd apps/mobile
npx eas-cli@latest login            # free Expo account
npx eas-cli@latest init             # writes the EAS projectId into app.json
npx eas-cli@latest build -p android --profile preview    # produces an installable APK link
```

**Test on an emulator (no phone needed).** Java 17 and the Android SDK are installed in the home folder (`source ~/Android/env.sh`). Build once with `npx expo prebuild -p android && cd android && ./gradlew :app:assembleDebug -PreactNativeArchitectures=x86_64`, start the `sw_pixel` emulator, run `adb reverse tcp:8080 tcp:8080; adb reverse tcp:8081 tcp:8081`, install the APK and run `npx expo start --dev-client`. Set the GPS with `adb emu geo fix <lng> <lat>`. In development builds only, `smartwaste:///scan?devqr=<QR payload>` feeds a code into the crew scan flow (an emulator camera cannot see a printed sticker).

Push notifications on Android need a free Firebase project: download `google-services.json`, add `"googleServicesFile": "./google-services.json"` under `android` in `app.json`, and upload the FCM v1 service-account key with `npx eas-cli credentials`. Without it, everything else works and alerts still appear in the in-app notification list.

## Free sandbox accounts to connect

| Service | Why | Sign up | Where the keys go |
|---|---|---|---|
| MTN MoMo Developer | Bill payment (Collection API, sandbox) | momodeveloper.mtn.com → subscribe to *Collections* | `MOMO_SUBSCRIPTION_KEY`; then create the API user/key (`node scripts/momo-provision.mjs`) → `MOMO_API_USER`, `MOMO_API_KEY` |
| Africa's Talking | USSD menu (sandbox simulator) | account.africastalking.com → Sandbox | No key needed; set the USSD callback to `https://<api>/ussd` |
| Infobip (configured) | Real SMS: arrival, pickup, bill and payment alerts for households without push, USSD confirmations | infobip.com free trial | `ops.secrets`: `infobip_base_url`, `infobip_api_key`, `sms_allowlist` (comma-separated `2507…` numbers, or `*` for everyone) |
| Gmail SMTP (configured) | Password-reset and confirmation emails | Google app password | Supabase → Authentication → SMTP |

Sandbox limits to state in the report: MoMo sandbox uses test numbers and EUR and does not prompt a real phone; Africa's Talking sandbox USSD only reaches their web simulator; the Infobip free trial sends real SMS but only 15 messages and only to the verified number (`sms_allowlist` keeps it to that number; every send is logged in `ops.sms_log`). In-app push, the in-app notification list and the web dashboard are fully real.

## Machine learning

```bash
cd ml
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python "tensorflow-cpu>=2.18,<2.21" pillow scikit-learn pandas numpy supabase
.venv/bin/python train_classifier.py           # → artifacts/waste_classifier.tflite + classifier_metrics.json
cp artifacts/waste_classifier.tflite ../apps/mobile/assets/model/
.venv/bin/python train_demand.py --simulate 300 --upload --activate   # after pilot pickups exist
```

- Demand labels come from crews: every scan records the bin fill level. Until enough real pickups exist, planning uses transparent **cold-start rules** (shown as `cold-start-rules-v1` everywhere).
- Simulated history (`--simulate`) is generated in memory, used **only for training**, never stored in the database, and all reported metrics use real pickups when available.
- Classifier data: TrashNet (MIT) + Garbage Classification 12-class (ODbL), mapped to organic/plastic/paper/metal/glass/other. Add pilot photos under `ml/data/local/<class>/` and retrain.

## Roles

| Role | App | Created by |
|---|---|---|
| Household | Mobile (+ USSD) | Self sign-up |
| Recycler / cooperative | Web | Self sign-up |
| Crew | Mobile | Admin → Users & roles → Create staff account |
| Manager, Officer (with sector), Admin | Web | Admin (the first admin: sign up, then `update profiles set role='admin' where email='…'` via `scripts/db-apply.mjs --sql`) |

## Security notes

- Row Level Security on every table; the service-role key is used only by the API after it has checked the caller.
- QR codes are HMAC-signed with a per-household secret that no client can read; pickups are validated server-side (signature, crew zone, GPS distance, time window) and are idempotent for offline retries.
- Roles and fees can only be changed by staff/admins (database triggers enforce it).
- Rotate the Supabase service-role key and access token before the pilot if they were ever shared in chat or email.
