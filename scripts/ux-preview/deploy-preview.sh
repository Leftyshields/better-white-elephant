#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PROJECT_ALIAS="${UX_PREVIEW_FIREBASE_ALIAS:-ux-preview}"
CHANNEL_ID="${UX_PREVIEW_CHANNEL:-ux-review}"
CONFIG_FILE="${UX_PREVIEW_FIREBASE_CONFIG:-firebase.ux-preview.json}"

if [[ ! -f "$ROOT/client/.env.ux-preview" && ! -f "$ROOT/client/.env.ux-preview.local" ]]; then
  echo "Missing client/.env.ux-preview — copy client/.env.ux-preview.example and fill preview project values."
  exit 1
fi

echo "Building client (mode=ux-preview)..."
(
  cd client
  npm run build:ux-preview
)

echo "Deploying Hosting preview channel '$CHANNEL_ID' (project alias: $PROJECT_ALIAS)..."
npx firebase hosting:channel:deploy "$CHANNEL_ID" \
  --config "$CONFIG_FILE" \
  --project "$PROJECT_ALIAS" \
  --expires 30d

if [[ "${UX_PREVIEW_RUN_SEED:-0}" == "1" ]]; then
  echo "Seeding preview data..."
  node scripts/ux-preview/seed.mjs
fi

echo "Done. Channel URL is printed above by the Firebase CLI."
