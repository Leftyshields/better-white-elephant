# UX preview (isolated Firebase Hosting)

Reviewers need lobby, active, and ended in-game flows **without a Google account** and **without touching production** (`better-white-elephant` / stealorreveal.com).

## Architecture

| Layer | Production | UX preview |
| --- | --- | --- |
| Hosting | Live channel → stealorreveal.com | Preview channel on **separate Firebase project** |
| Auth | Google only (enforced in UI) | Email/password on preview project only |
| Firestore | Production data | Seeded fixtures in preview project |
| Game server | Production Cloud Run + Redis | **Staging** server aimed at preview Firebase (not prod API) |
| Client build | `vite build` (default) | `vite build --mode ux-preview` |

The preview client is compiled with `__UX_PREVIEW__ === true`. The production build sets that flag to `false` and tree-shakes preview sign-in, emulator hooks, and preview chrome.

`?sim=true` / `SimulationControls` remain a **developer** tool only. They are not the UX preview mechanism.

## One-time setup (Brian — Firebase / GCP console)

These steps are **not** applied to the production project.

1. **Create Firebase project** `better-white-elephant-ux-preview` (or another name — update `.firebaserc` `projects.ux-preview`).
2. **Enable Authentication → Email/Password** on that project only.
3. **Create a web app** and copy config into `client/.env.ux-preview` (from `client/.env.ux-preview.example`).
4. **Deploy Firestore rules + indexes** from this repo to the preview project:
   ```bash
   npx firebase deploy --only firestore:rules,firestore:indexes --project ux-preview
   ```
5. **Service account** for seeding/CI (Project settings → Service accounts → Generate new private key). Store as a secret; never commit the JSON.
6. **Optional — active gameplay**: Deploy Cloud Run game server + Redis using the **preview** Firebase Admin credentials and set `VITE_SERVER_URL` to that URL. Without this, lobby and ended flows work from Firestore; active in-game turns need the socket server.

## Local workflow (emulators, not on public internet)

```bash
# Terminal 1 — emulators (Auth + Firestore + Hosting UI)
npx firebase emulators:start --config firebase.ux-preview.json --project ux-preview

# Terminal 2 — seed (password via env or scripts/ux-preview/.seed-credentials.local)
export UX_PREVIEW_SEED_PASSWORD='your-local-password'
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export GCLOUD_PROJECT=better-white-elephant-ux-preview
node scripts/ux-preview/seed.mjs

# Terminal 3 — client
cd client
cp .env.ux-preview.example .env.ux-preview   # set VITE_USE_FIREBASE_EMULATORS=true for emulator-only local
npm run dev:ux-preview
```

Emulators bind to localhost by default — do **not** expose Auth emulator ports to the public internet.

## Hosted preview URL

```bash
# After client/.env.ux-preview is configured for the preview Firebase project:
chmod +x scripts/ux-preview/deploy-preview.sh
UX_PREVIEW_RUN_SEED=1 UX_PREVIEW_SEED_PASSWORD='...' GOOGLE_APPLICATION_CREDENTIALS=/path/to/preview-sa.json \
  ./scripts/ux-preview/deploy-preview.sh
```

Firebase CLI prints a channel URL such as:

`https://better-white-elephant-ux-preview--ux-review-xxxxx.web.app`

## Seeded accounts and parties

| Item | Value |
| --- | --- |
| Reviewer email | `ux-reviewer@preview.stealorreveal.test` |
| Password | `UX_PREVIEW_SEED_PASSWORD` / CI secret (not in git) |
| Lobby party | `/party/ux-preview-lobby` |
| Active party | `/party/ux-preview-active` |
| Ended party | `/party/ux-preview-ended` |

Re-run `node scripts/ux-preview/seed.mjs` to refresh data (idempotent).

## CI

Workflow `.github/workflows/ux-preview.yml` (manual) builds `ux-preview` mode and deploys a Hosting preview channel when preview secrets are configured.

Required secrets (preview project only):

- `UX_PREVIEW_FIREBASE_SERVICE_ACCOUNT`
- `UX_PREVIEW_VITE_*` (same keys as production deploy, but preview values)
- `UX_PREVIEW_SEED_PASSWORD`

## Production safety

- Seed script **refuses** `better-white-elephant` unless emulators are in use.
- Production deploy workflow and live Hosting channel are unchanged.
- No preview env flags in the default `vite build`.
