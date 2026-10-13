#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$PROJECT_DIR/scripts/crawler-env.sh"
BRAND=${1:?brand required}
COUNTRY=${2:?country required}
shift 2

"$PROJECT_DIR/scripts/token-safety-gate.sh" >/dev/null

# Explicit diagnostics still use both central safety gates and the guarded runner.
# Never load storage credentials or run ingest in this mode.
if [ "${1:-}" = '--crawl-only' ]; then
  shift
  LUXURY_PIPELINE_GUARD=enabled "$PROJECT_DIR/scripts/run-crawler.sh" "$BRAND" "$COUNTRY" "$@"
  echo "PASS: $BRAND/$COUNTRY crawl-only completed; storage was not modified."
  exit 0
fi
for option in "$@"; do
  if [ "$option" = '--inspect-linked-candidates' ] || [ "$option" = '--image-source-samples-file' ] || [ "$option" = '--inspect-image-model' ]; then
    echo 'BLOCKED: diagnostic sampling is crawl-only.' >&2
    exit 1
  fi
done

# A scheduled run has no interactive shell environment. Reuse an existing
# credential only; never save secrets or put them into the launchd plist.
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  CLOUDFLARE_API_TOKEN=$(security find-generic-password -s 'luxury.cloudflare.api-token' -w 2>/dev/null) || {
    echo 'FAILED: STORAGE_CREDENTIAL_UNAVAILABLE' >&2
    exit 1
  }
  export CLOUDFLARE_API_TOKEN
fi
if [ "${1:-}" = '--check-storage-credential' ]; then
  [ "$#" -eq 1 ] || exit 2
  echo 'PASS: storage credential available.'
  exit 0
fi

case "$BRAND/$COUNTRY" in
  chanel/kr) INGEST_SCRIPT="$PROJECT_DIR/scripts/ingest-chanel-products.sh" ;;
  prada/kr) INGEST_SCRIPT="$PROJECT_DIR/scripts/ingest-chanel-products.sh" ;;
  bottega-veneta/kr) INGEST_SCRIPT="$PROJECT_DIR/scripts/ingest-chanel-products.sh" ;;
  bottega-veneta/jp|bottega-veneta/fr|bottega-veneta/it|bottega-veneta/es|bottega-veneta/us|bottega-veneta/sg|bottega-veneta/hk) INGEST_SCRIPT="$PROJECT_DIR/scripts/ingest-bottega-country.mjs" ;;
  prada/jp|prada/fr|prada/it|prada/es|prada/us|prada/sg|prada/hk) INGEST_SCRIPT="$PROJECT_DIR/scripts/ingest-chanel-country.sh" ;;
  chanel/jp|chanel/fr|chanel/it|chanel/es|chanel/us|chanel/sg|chanel/hk) INGEST_SCRIPT="$PROJECT_DIR/scripts/ingest-chanel-country.sh" ;;
  *) echo "BLOCKED: no reviewed ingest adapter for $BRAND/$COUNTRY." >&2; exit 1 ;;
esac
if [ "$BRAND/$COUNTRY" = prada/kr ]; then
 for option in "$@"; do
  if [ "$option" = --prices-only ]; then INGEST_SCRIPT="$PROJECT_DIR/scripts/ingest-chanel-country.sh"; fi
 done
fi

set +x
for option in "$@"; do
 if [ "$option" = --image-refresh-file ]; then
  [ "$COUNTRY" = kr ] || exit 2
  INGEST_SCRIPT="$PROJECT_DIR/scripts/ingest-product-images.mjs"
 fi
done
SERVICE_KEY=${SUPABASE_SERVICE_ROLE_KEY:-}
if [ -z "$SERVICE_KEY" ]; then
ACCESS_TOKEN=$(security find-generic-password -s 'carrywise.supabase.access-token' -a 'carrywise-project' -w 2>/dev/null) || \
  ACCESS_TOKEN=$(security find-generic-password -s 'carrywise.supabase.access-token' -a 'carrywise-project' -w \
    "$HOME/Library/Keychains/login_renamed_1.keychain-db" 2>/dev/null) || {
    echo 'FAILED: DATABASE_CREDENTIAL_UNAVAILABLE' >&2; exit 1;
  }
KEYS_JSON=$(SUPABASE_ACCESS_TOKEN="$ACCESS_TOKEN" supabase projects api-keys --project-ref nxgnbrdxxmlhtcnymqsl --output json 2>/dev/null) || {
  echo 'FAILED: DATABASE_API_UNAVAILABLE' >&2; exit 1;
}
SERVICE_KEY=$(printf '%s' "$KEYS_JSON" | jq -r '.[] | select(.name=="service_role") | .api_key')
[ -n "$SERVICE_KEY" ] || { echo 'FAILED: DATABASE_CREDENTIAL_UNAVAILABLE' >&2; exit 1; }
unset ACCESS_TOKEN KEYS_JSON
fi

LUXURY_PIPELINE_GUARD=enabled "$PROJECT_DIR/scripts/run-crawler.sh" "$BRAND" "$COUNTRY" "$@"
RUN_DIR=$(find "$PROJECT_DIR/crawler/runs/$BRAND/$COUNTRY" -mindepth 1 -maxdepth 1 -type d -print | sort | tail -n 1)
RECORD_FILE="$RUN_DIR/artifacts/records.json"
[ -f "$RECORD_FILE" ] || { echo "BLOCKED: validated records missing." >&2; exit 1; }

if [ "$BRAND" = bottega-veneta ] && [ "$COUNTRY" != kr ] && jq -e 'type == "array" and length == 0' "$RECORD_FILE" >/dev/null; then
  node --input-type=module -e '
    import fs from "node:fs";
    const [root, records, summary, country]=process.argv.slice(1);
    const {recordedEmptyBottegaPriceBatch}=await import(root+"/crawler/common/bottega-progress.js");
    if(!recordedEmptyBottegaPriceBatch(JSON.parse(fs.readFileSync(records)),JSON.parse(fs.readFileSync(summary)),country.toUpperCase()))process.exit(1);
  ' "$PROJECT_DIR" "$RECORD_FILE" "$RUN_DIR/summary.json" "$COUNTRY" || { echo 'BLOCKED: empty price batch is not verified ordinary failures.' >&2; exit 1; }
  unset ACCESS_TOKEN KEYS_JSON SERVICE_KEY
  chmod 000 "$RECORD_FILE" 2>/dev/null || true
  echo 'RECORDED: no confirmed prices in this batch; no database or storage writes.'
  exit 0
fi

storage_stage() {
 [ "$BRAND" = bottega-veneta ] || return 0
 mkdir -p "$RUN_DIR/storage-report"
 jq -nc --arg brand "$BRAND" --arg country "$(printf '%s' "$COUNTRY" | tr '[:lower:]' '[:upper:]')" --arg status "$1" \
  --slurpfile config "$PROJECT_DIR/crawler/brands/$BRAND/countries/$COUNTRY" \
  '[{brand:$brand,country:$country,parentModel:"중앙 적재 단계",variantCode:"RUN",price:null,currency:$config[0].currency,status:$status,officialUrl:$config[0].entryUrl}]' \
  >"$RUN_DIR/storage-report/summary.json"
 "$PROJECT_DIR/scripts/crawl-output-guard.sh" "$RUN_DIR/storage-report/summary.json" >/dev/null
}
storage_stage INGEST_STARTING


env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" \
  LUXURY_PIPELINE_GUARD=enabled \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
  CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:?missing Cloudflare token}" \
  CLOUDFLARE_ACCOUNT_ID='4c0f5d706177b84ade4d424a08ec46e8' \
  LUXURY_SERVICE_STATE_DIR="${LUXURY_SERVICE_STATE_DIR:-}" \
  LUXURY_MARKET_COUNTRY="$COUNTRY" \
  LUXURY_INGEST_BRAND="$BRAND" \
  WRANGLER_SEND_METRICS=false \
  node "$PROJECT_DIR/scripts/network-isolate.mjs" \
  '["nxgnbrdxxmlhtcnymqsl.supabase.co","api.cloudflare.com","4c0f5d706177b84ade4d424a08ec46e8.r2.cloudflarestorage.com","luxury-assets.dailyhotcoolmeme.workers.dev"]' 0 \
  "$INGEST_SCRIPT" "$RECORD_FILE"
storage_stage INGEST_VERIFIED
unset ACCESS_TOKEN KEYS_JSON SERVICE_KEY
storage_stage CREDENTIALS_CLEARED

find "$RUN_DIR/raw" "$RUN_DIR/browser-profile" -type f -exec chmod 000 {} + 2>/dev/null || true
find "$RUN_DIR" -maxdepth 1 -type f -name '*.log' -exec chmod 000 {} + 2>/dev/null || true
node "$PROJECT_DIR/scripts/cleanup-image-originals.mjs" "$RECORD_FILE"
storage_stage ORIGINALS_CLEANED
chmod 000 "$RECORD_FILE" 2>/dev/null || true
echo "PASS: $BRAND/$COUNTRY crawl and storage completed through guarded pipeline."
