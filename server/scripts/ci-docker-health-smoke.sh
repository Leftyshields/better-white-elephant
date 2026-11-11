#!/usr/bin/env bash
# Build the production image and verify GET /health returns JSON with status ok.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-better-white-elephant-server:ci-smoke}"
HOST_PORT="${HOST_PORT:-18080}"
CONTAINER_PORT="${CONTAINER_PORT:-8080}"
REDIS_URL="${REDIS_URL:-redis://host.docker.internal:6379}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for this smoke test"
  exit 1
fi

TMP_KEY="$(mktemp)"
trap 'rm -f "$TMP_KEY"; docker rm -f bwe-server-smoke >/dev/null 2>&1 || true' EXIT

openssl genrsa -out "$TMP_KEY" 2048 2>/dev/null
FIREBASE_PRIVATE_KEY="$(awk '{printf "%s\\n", $0}' "$TMP_KEY" | sed 's/\\n$//')"

echo "Building ${IMAGE_NAME}..."
docker build -t "${IMAGE_NAME}" "${ROOT}"

docker rm -f bwe-server-smoke >/dev/null 2>&1 || true

CID="$(docker run -d --name bwe-server-smoke \
  --add-host=host.docker.internal:host-gateway \
  -e PORT="${CONTAINER_PORT}" \
  -e NODE_ENV=production \
  -e REDIS_URL="${REDIS_URL}" \
  -e FIREBASE_PROJECT_ID=ci-smoke-project \
  -e FIREBASE_CLIENT_EMAIL=ci-smoke@ci-smoke-project.iam.gserviceaccount.com \
  -e "FIREBASE_PRIVATE_KEY=${FIREBASE_PRIVATE_KEY}" \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  "${IMAGE_NAME}")"

echo "Container ${CID} started; waiting for /health..."

for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${HOST_PORT}/health" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    echo "GET /health OK"
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for /health"
docker logs bwe-server-smoke || true
exit 1
