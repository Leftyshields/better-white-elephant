# Deploy the game server to Google Cloud Run

Operator guide for GCP project **`better-white-elephant`**.

- **Frontend:** Firebase Hosting (unchanged by this workflow). After deploy, set GitHub secret `VITE_SERVER_URL` and run the Firebase Hosting deploy workflow when you are ready.
- **Game server:** Cloud Run service **`stealorreveal-game-server`** in **`us-central1`**
- **Canonical service URL** (no trailing slash): `https://stealorreveal-game-server-jtlpqb4y3q-uc.a.run.app`
- **Deploy workflow:** [`.github/workflows/deploy-game-server-cloud-run.yml`](../../.github/workflows/deploy-game-server-cloud-run.yml). **`workflow_dispatch` only** (does not run on push to `main`)

## Architecture

- **Image:** `server/Dockerfile`. Node 20 (digest-pinned), `npm ci --omit=dev`, `server/package-lock.json` for reproducible builds
- **Artifact Registry repo:** `game-server` (`us-central1`)
- **Runtime identity:** dedicated SA `game-server-runtime@better-white-elephant.iam.gserviceaccount.com` (not the default compute SA)

Socket.io uses **one** instance (`min-instances=1`, `max-instances=1`), **session affinity**, **CPU always allocated** (`--no-cpu-throttling`), **3600s** request timeout. There is **no** Socket.io Redis adapter, only the `redis` npm client for application state. Scaling beyond one instance needs an adapter later.

## GitHub: `game-server` environment (required)

The deploy job runs only when the workflow is started from branch **`main`** and targets GitHub Environment **`game-server`**.

1. Repo → **Settings** → **Environments** → **New environment** → name: `game-server`
2. **Required reviewers** → add **Leftyshields** (Brian)
3. Save

Until this exists, `workflow_dispatch` from `main` will fail the environment gate.

## GitHub: environment secrets (deploy auth)

Add these on the **`game-server`** environment (**Settings** → **Environments** → **game-server** → **Environment secrets**), not as repository-wide secrets:

| Secret name | Purpose |
|-------------|---------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full WIF provider resource name (`projects/.../locations/global/workloadIdentityPools/.../providers/...`) |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | Deploy SA email (e.g. `github-game-server-deploy@better-white-elephant.iam.gserviceaccount.com`) |

Do **not** store `REDIS_URL` or `FIREBASE_*` in GitHub for runtime. Those live in **Google Secret Manager** (below).

Non-secret CORS origins are set in the workflow `env_vars` block as `ALLOWED_ORIGINS=https://stealorreveal.com,https://www.stealorreveal.com`. Change that block if domains change.

To set the same value manually with `gcloud` (comma must be preserved):

```bash
gcloud run services update stealorreveal-game-server \
  --project=better-white-elephant \
  --region=us-central1 \
  --update-env-vars=^|^ALLOWED_ORIGINS=https://stealorreveal.com,https://www.stealorreveal.com
```

## 1. Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  --project=better-white-elephant
```

## 2. Artifact Registry

```bash
gcloud artifacts repositories create game-server \
  --repository-format=docker \
  --location=us-central1 \
  --project=better-white-elephant
```

## 3. Secret Manager (runtime credentials)

Create secrets (**names only**; store real values in GCP Console or `gcloud`, never in git):

| Secret Manager name | Becomes container env var |
|---------------------|---------------------------|
| `game-server-redis-url` | `REDIS_URL` |
| `game-server-firebase-project-id` | `FIREBASE_PROJECT_ID` |
| `game-server-firebase-client-email` | `FIREBASE_CLIENT_EMAIL` |
| `game-server-firebase-private-key` | `FIREBASE_PRIVATE_KEY` |

Example (run locally; paste values when prompted):

```bash
gcloud secrets create game-server-redis-url --replication-policy=automatic --project=better-white-elephant
gcloud secrets versions add game-server-redis-url --data-file=-

# Repeat for the three Firebase secrets.
```

For `game-server-firebase-private-key`, prefer storing the PEM with real newlines in Secret Manager (the server also accepts `\n`-escaped single-line values).

### Grant runtime SA access to secrets

```bash
RUNTIME_SA=game-server-runtime@better-white-elephant.iam.gserviceaccount.com
for secret in game-server-redis-url game-server-firebase-project-id \
  game-server-firebase-client-email game-server-firebase-private-key; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --project=better-white-elephant \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

## 4. Redis (Upstash)

Production uses **Upstash Redis**. Store the connection URL in Secret Manager as **`game-server-redis-url`**. The deploy workflow and runtime SA read that secret; do not point production at ad-hoc Redis URLs from other hosts.

After deploy, confirm logs show `✅ Redis connected`.

## 5. Runtime service account

Create once:

```bash
gcloud iam service-accounts create game-server-runtime \
  --display-name="Steal or Reveal game server (Cloud Run)" \
  --project=better-white-elephant
```

Grant **only what the server needs**:

| Access | Role / binding |
|--------|----------------|
| Firestore (Firebase Admin SDK) | `roles/datastore.user` on project (or tighter custom role if your org requires it) |
| Secret Manager (four secrets above) | `roles/secretmanager.secretAccessor` per secret (see §3) |

If the workflow `GAME_SERVER_RUNTIME_SERVICE_ACCOUNT` email differs, update `.github/workflows/deploy-game-server-cloud-run.yml` `env:` to match (workflow file is not modified as part of routine doc edits).

## 6. Deploy service account + Workload Identity Federation

Avoid a second long-lived JSON key for deploy. Hosting uses `FIREBASE_SERVICE_ACCOUNT`; game-server deploy uses **WIF**.

### 6a. Create deploy service account

```bash
gcloud iam service-accounts create github-game-server-deploy \
  --display-name="GitHub Actions - game server deploy" \
  --project=better-white-elephant
```

### 6b. Least-privilege deploy permissions

**Do not** grant the deploy SA project-wide `secretmanager.versions.access`, project-wide `iam.serviceAccounts.actAs`, or broad `roles/run.admin` across every Cloud Run service.

Prefer a narrow custom role for Cloud Run **create/update/get** on the target service plus **Artifact Registry writer only on the `game-server` repository**:

```bash
gcloud iam roles create gameServerCloudRunDeployer \
  --project=better-white-elephant \
  --title="Game server Cloud Run deploy (CI)" \
  --permissions=run.services.create,run.services.update,run.services.get,run.services.delete,run.operations.get,artifactregistry.repositories.uploadArtifacts,artifactregistry.dockerimages.get
```

Grant it at project level (or tighten to the single service and repo if your security team requires resource-level IAM):

```bash
DEPLOY_SA=github-game-server-deploy@better-white-elephant.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding better-white-elephant \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="projects/better-white-elephant/roles/gameServerCloudRunDeployer"
```

Grant **`roles/artifactregistry.writer`** on the **`game-server`** Artifact Registry repo only (if not already covered by a repo-scoped binding).

Allow the deploy SA to run as the **runtime** SA only (`roles/iam.serviceAccountUser` on `game-server-runtime@...`, not project-wide `actAs`):

```bash
gcloud iam service-accounts add-iam-policy-binding game-server-runtime@better-white-elephant.iam.gserviceaccount.com \
  --project=better-white-elephant \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/iam.serviceAccountUser"
```

The deploy SA **cannot** set Cloud Run IAM. A project owner or separate break-glass step must grant **`roles/run.invoker`** to **`allUsers`** on `stealorreveal-game-server` so `/health` and Socket.io work without authenticated clients:

```bash
gcloud run services add-iam-policy-binding stealorreveal-game-server \
  --project=better-white-elephant \
  --region=us-central1 \
  --member="allUsers" \
  --role="roles/run.invoker"
```

### 6c. Workload Identity Federation (GitHub → GCP)

Follow [Google’s GitHub Actions WIF guide](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines#github-actions) for project `better-white-elephant`:

1. Create a workload identity pool (e.g. `github-pool`) and OIDC provider for `https://token.actions.githubusercontent.com`
2. Attribute condition limiting to **this repository and `main`**, e.g. `assertion.repository=='Leftyshields/better-white-elephant' && assertion.ref=='refs/heads/main'`
3. Bind `roles/iam.workloadIdentityUser` on `github-game-server-deploy@...` to:

   `principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/Leftyshields/better-white-elephant`

4. Add environment secrets `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT` on **`game-server`**

No JSON key is required for the default workflow path.

## 7. Run the deploy workflow

1. Ensure you are on **`main`** with the workflow file present
2. **Actions** → **Deploy game server to Cloud Run** → **Run workflow** → branch **`main`**
3. Approve the **`game-server`** environment review if prompted
4. Note the service URL from the job log (should match the canonical URL unless the service was recreated)

```bash
curl -sS "https://stealorreveal-game-server-jtlpqb4y3q-uc.a.run.app/health"
```

Expect `"status":"ok"`.

## 8. Point the frontend (later)

After `/health` is good:

1. Set GitHub secret **`VITE_SERVER_URL`** to the Cloud Run URL (no trailing slash)
2. Run **Deploy to Firebase Hosting** (workflow or `firebase deploy --only hosting`)

## Local Docker smoke

```bash
bash server/scripts/ci-docker-health-smoke.sh
```

Requires Docker and Redis reachable at `REDIS_URL` (default `redis://host.docker.internal:6379`).

## CI

Pull requests run **Game server Docker health smoke** in `.github/workflows/ci.yml` (`docker build` + `GET /health`).
