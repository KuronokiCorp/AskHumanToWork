#!/usr/bin/env bash
# Deploy AskHumanToWork to Google Cloud Run + Cloud SQL.
#
# Usage: ./scripts/deploy-cloudrun.sh <PROJECT_ID> [REGION]
#
# Idempotent: safe to re-run for redeploys (skips resources that exist).
# Creates: Artifact Registry repo, Cloud SQL Postgres (db-f1-micro), secrets,
# and two Cloud Run services (app = API+web+MCP, worker = reminders/sync).
set -euo pipefail

PROJECT="${1:?usage: deploy-cloudrun.sh <PROJECT_ID> [REGION]}"
REGION="${2:-asia-northeast1}"
SQL_INSTANCE="ahtw-pg"
DB_NAME="askhumantowork"
DB_USER="askhumantowork"
REPO="app"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/askhumantowork:latest"

echo "==> project: $PROJECT  region: $REGION"
gcloud config set project "$PROJECT" --quiet

echo "==> enabling APIs"
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com --quiet

echo "==> artifact registry"
gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --quiet

echo "==> building image with Cloud Build (~5 min)"
gcloud builds submit --tag "$IMAGE" --quiet

echo "==> cloud sql instance (db-f1-micro, ~\$10/mo; created once, ~10 min)"
if ! gcloud sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1; then
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_16 --tier=db-f1-micro --region="$REGION" \
    --storage-size=10GB --storage-auto-increase --quiet
fi
SQL_CONN="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"

echo "==> database + user"
gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" >/dev/null 2>&1 ||
  gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --quiet

ensure_secret() { # name generator-cmd
  if ! gcloud secrets describe "$1" >/dev/null 2>&1; then
    eval "$2" | tr -d '\n' | gcloud secrets create "$1" --data-file=- --quiet
  fi
}
ensure_secret ahtw-db-password "openssl rand -base64 24"
ensure_secret ahtw-session-secret "openssl rand -base64 32"
ensure_secret ahtw-encryption-key "openssl rand -base64 32"

DB_PASSWORD="$(gcloud secrets versions access latest --secret=ahtw-db-password)"
gcloud sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASSWORD" --quiet 2>/dev/null ||
  gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASSWORD" --quiet

# unix-socket URL — both postgres.js and pg understand ?host=/cloudsql/...
DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${SQL_CONN}"

echo "==> deploying app service"
gcloud run deploy askhumantowork \
  --image="$IMAGE" --region="$REGION" --allow-unauthenticated \
  --add-cloudsql-instances="$SQL_CONN" \
  --command="sh" --args="-c,node packages/db/dist/migrate.js && node packages/api/dist/index.js" \
  --memory=512Mi --min-instances=0 --max-instances=3 \
  --set-secrets="SESSION_SECRET=ahtw-session-secret:latest,ENCRYPTION_KEY=ahtw-encryption-key:latest" \
  --set-env-vars="^@^DATABASE_URL=${DATABASE_URL}@SERVE_WEB=true@COOKIE_SECURE=true@TRUST_PROXY=true@API_PORT=8080" \
  --port=8080 --quiet

APP_URL="$(gcloud run services describe askhumantowork --region="$REGION" --format='value(status.url)')"
echo "==> app at $APP_URL — pinning base URLs"
gcloud run services update askhumantowork --region="$REGION" \
  --update-env-vars="API_BASE_URL=${APP_URL},WEB_BASE_URL=${APP_URL}" --quiet

echo "==> deploying worker service (always-on)"
gcloud run deploy askhumantowork-worker \
  --image="$IMAGE" --region="$REGION" --no-allow-unauthenticated \
  --add-cloudsql-instances="$SQL_CONN" \
  --command="node" --args="packages/api/dist/worker.js" \
  --memory=512Mi --min-instances=1 --max-instances=1 --no-cpu-throttling \
  --set-secrets="SESSION_SECRET=ahtw-session-secret:latest,ENCRYPTION_KEY=ahtw-encryption-key:latest" \
  --set-env-vars="^@^DATABASE_URL=${DATABASE_URL}@API_BASE_URL=${APP_URL}@WEB_BASE_URL=${APP_URL}" \
  --port=8080 --quiet

echo
echo "✅ deployed: $APP_URL"
echo "   MCP endpoint: ${APP_URL}/mcp"
echo
echo "next steps:"
echo "  - sign up at $APP_URL (first account; promote to admin/pro in Cloud SQL if needed)"
echo "  - reminder EMAILS need SMTP env vars (SMTP_HOST/PORT/FROM) from a provider (Resend/SendGrid/SES);"
echo "    web-push works once VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY env vars are set"
