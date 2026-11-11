# Deploy the game server to Google Cloud Run

This guide is for operators (Brian). It wires the existing `server/` Node.js + Socket.io API into **Google Cloud Run** in GCP/Firebase project **`better-white-elephant`**. The live React app stays on Firebase Hosting; this PR does not change `VITE_SERVER_URL` or redeploy the client.

## What you are deploying

- **Container:** `server/Dockerfile` (Node 20, production dependencies only)
- **Service name (default in workflow):** `stealorreveal-game-server`
- **Region (default):** `us-central1`
- **Artifact Registry repo (default):** `game-server`

Socket.io runs on a **single** Cloud Run instance (`min-instances=1`, `max-instances=1`) with **session affinity** and **CPU always allocated** (`--no-cpu-throttling`). There is **no** Socket.io Redis adapter in this repo—only the `redis` npm client for game state and autoplay keys. Multi-instance scaling would need an adapter later.

## 1. Enable APIs

In [Google Cloud Console](https://console.cloud.google.com/) (project `better-white-elephant`):

1. **Cloud Run API** (`run.googleapis.com`)
2. **Artifact Registry API** (`artifactregistry.googleapis.com`)

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  --project=better-white-elephant
```

## 2. Artifact Registry repository

Create a Docker repository (once):

```bash
gcloud artifacts repositories create game-server \
  --repository-format=docker \
  --location=us-central1 \
  --project=better-white-elephant
```

## 3. Redis

The server requires **`REDIS_URL`** at runtime (game state cache, bot autoplay). Use an existing instance or create one:

- **Upstash** (simple TLS URL), or  
- **Google Cloud Memorystore for Redis** (VPC; more setup on Cloud Run)

Confirm connectivity from Cloud Run after deploy (check Cloud Run logs for `✅ Redis connected`).

## 4. Firebase Admin credentials

The server expects these environment variables (see `server/config/firebase-admin.js`):

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` — store in GitHub as a **single line** with `\n` where line breaks belong (the server unwraps them). Do not commit the key.

You can copy fields from Firebase Console → Project settings → Service accounts, or use a dedicated service account for the game server.

## 5. GitHub Actions repository secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

| Secret name | Purpose |
|-------------|---------|
| `GCP_DEPLOY_SA_KEY` | JSON key for a **deploy-only** Google service account (not `FIREBASE_SERVICE_ACCOUNT` used for Hosting). |
| `REDIS_URL` | Redis connection URL for the running game server. |
| `FIREBASE_PROJECT_ID` | Firebase/GCP project id (`better-white-elephant`). |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin client email. |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin private key (escaped newlines as `\n`). |
| `ALLOWED_ORIGINS` | `https://stealorreveal.com,https://www.stealorreveal.com` |

Optional: override defaults by editing `env:` at the top of `.github/workflows/deploy-game-server-cloud-run.yml` (`GCP_REGION`, `CLOUD_RUN_SERVICE`, etc.).

## 6. Deploy service account IAM

Create a service account (example name: `github-game-server-deploy`) and grant **least privilege** for CI deploy only:

| Role | Why |
|------|-----|
| `roles/run.admin` | Deploy and update the Cloud Run service |
| `roles/artifactregistry.writer` | Push images |
| `roles/iam.serviceAccountUser` | Act as the Cloud Run runtime service account (if required by your org policy) |

Download a JSON key and save it as GitHub secret **`GCP_DEPLOY_SA_KEY`**.

The **runtime** Cloud Run service account (default compute SA or one you attach) still needs **Firebase/Firestore** access for Admin SDK calls (e.g. `roles/datastore.user` or a custom role). That is separate from the deploy SA.

## 7. Run the deploy workflow

1. GitHub → **Actions** → **Deploy game server to Cloud Run**
2. **Run workflow** on `main` (after this PR is merged)
3. When it finishes, note the service URL from the workflow log (`status.url`)

Smoke check:

```bash
curl -sS "https://YOUR-SERVICE-xxx.run.app/health"
```

Expect JSON with `"status":"ok"`.

## 8. Point the frontend (later)

After a green deploy and a successful `/health` check:

1. Set GitHub secret **`VITE_SERVER_URL`** to the Cloud Run URL (no trailing slash).
2. Run **Deploy to Firebase Hosting** (or your normal Hosting workflow) so the client build picks up the new URL.

Do **not** do this step until Cloud Run is stable; the live site currently still targets the old Railway URL baked into the last Hosting deploy.

## Local Docker smoke (optional)

Same check CI runs:

```bash
# Redis on localhost:6379 (or set REDIS_URL)
bash server/scripts/ci-docker-health-smoke.sh
```

## CI

Pull requests run `server-docker-health` in `.github/workflows/ci.yml`: `docker build` + `curl` on `/health`.
