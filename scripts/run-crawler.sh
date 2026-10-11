#!/bin/sh
set -eu

if [ "${LUXURY_PIPELINE_GUARD:-}" != "enabled" ]; then
  echo "BLOCKED: use scripts/run-brand-country-pipeline.sh." >&2
  exit 1
fi

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$PROJECT_DIR/scripts/crawler-env.sh"
"$PROJECT_DIR/scripts/crawl-preflight.sh" >/dev/null

if [ "$#" -lt 2 ]; then
  echo "Usage: scripts/run-crawler.sh <brand> <country> [crawler arguments...]" >&2
  exit 2
fi

BRAND=$1
COUNTRY=$2
shift 2

if [ "$BRAND" = 'duty-free' ]; then
  echo 'BLOCKED: duty-free retailers were removed from the project scope.' >&2
  exit 2
fi

case "$BRAND" in *[!a-z0-9-]*|'') echo "BLOCKED: invalid brand id." >&2; exit 1;; esac
case "$COUNTRY" in *[!a-z]*|'') echo "BLOCKED: invalid country id." >&2; exit 1;; esac

CRAWLER_ENTRY="$PROJECT_DIR/crawler/brands/$BRAND/crawler"
COUNTRY_CONFIG="$PROJECT_DIR/crawler/brands/$BRAND/countries/$COUNTRY"

if [ ! -x "$CRAWLER_ENTRY" ]; then
  echo "BLOCKED: executable brand crawler not found." >&2
  exit 1
fi

if [ ! -f "$COUNTRY_CONFIG" ]; then
  echo "BLOCKED: country config not found." >&2
  exit 1
fi

# Fail before browser launch if this execution environment cannot apply the
# required kernel network sandbox. Never silently fall back to unisolated I/O.
if [ ! -x /usr/bin/sandbox-exec ] || ! /usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network-outbound)' /usr/bin/true >/dev/null 2>&1; then
  echo 'FAILED: NETWORK_SANDBOX_UNAVAILABLE; network isolation was not disabled.' >&2
  exit 78
fi

RUN_ID=$(date -u '+%Y%m%dT%H%M%SZ')-$$
RUN_DIR="$PROJECT_DIR/crawler/runs/$BRAND/$COUNTRY/$RUN_ID"
mkdir -p "$RUN_DIR/raw"
SUMMARY_FILE="$RUN_DIR/summary.json"
STDOUT_FILE="$RUN_DIR/stdout.log"
STDERR_FILE="$RUN_DIR/stderr.log"
CDP_URL=""
CDP_PORT=0
CHROME_PID=""
cleanup_browser() {
  if [ "$CDP_PORT" -gt 0 ]; then
    node "$PROJECT_DIR/scripts/close-crawl-browser.mjs" "$CDP_PORT" "$RUN_DIR/browser-profile" >/dev/null 2>&1 || true
  fi
  if [ -n "$CHROME_PID" ]; then
    kill -TERM "$CHROME_PID" 2>/dev/null || true
    wait "$CHROME_PID" 2>/dev/null || true
    CHROME_PID=""
  fi
}
trap cleanup_browser EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if jq -e '.browserMode == "headed-cdp"' "$COUNTRY_CONFIG" >/dev/null 2>&1; then
  CDP_PORT=$((9300 + ($$ % 500)))
  BROWSER_EXECUTABLE=$(jq -r '.browserExecutable' "$COUNTRY_CONFIG")
  BROWSER_ENTRY='about:blank'
  if [ "${LUXURY_USE_ASIDE:-0}" = '1' ]; then
    BROWSER_EXECUTABLE='/Applications/Aside.app/Contents/MacOS/Aside'
    if [ "${LUXURY_ASIDE_APP_MODE:-0}" = '1' ]; then
      BROWSER_ENTRY='--app=about:blank'
    fi
  fi
  if [ ! -x "$BROWSER_EXECUTABLE" ]; then
    echo 'FAILED: BROWSER_EXECUTABLE_UNAVAILABLE.' >&2
    exit 1
  fi
  env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" \
    USER="${USER:-}" LOGNAME="${LOGNAME:-}" LANG="${LANG:-C.UTF-8}" \
    LUXURY_BROWSER_MAINTENANCE_SINK="${LUXURY_BROWSER_MAINTENANCE_SINK:-0}" \
    LUXURY_NETWORK_STATUS_FILE="$RUN_DIR/browser-network-status.json" \
    node "$PROJECT_DIR/scripts/network-isolate.mjs" "$(jq -c '.allowedHosts' "$COUNTRY_CONFIG")" "$CDP_PORT" "$BROWSER_EXECUTABLE" \
    --remote-debugging-port="$CDP_PORT" \
    --user-data-dir="$RUN_DIR/browser-profile" \
    --no-first-run \
    --no-sandbox \
    --no-default-browser-check \
    --disable-quic \
    --disable-background-networking \
    --disable-component-update \
    --disable-domain-reliability \
    --disable-sync \
    --disable-client-side-phishing-detection \
    --safebrowsing-disable-auto-update \
    --disable-default-apps \
    --disable-extensions \
    --disable-component-extensions-with-background-pages \
    --disable-features=MediaRouter,OptimizationHints,CertificateTransparencyComponentUpdater,AutofillServerCommunication \
    --component-updater=url-source=http://127.0.0.1:9 \
    --extensions-update-url=http://127.0.0.1:9 \
    --proxy-server='__NETWORK_PROXY__' \
    "$BROWSER_ENTRY" >"$RUN_DIR/chrome.stdout.log" 2>"$RUN_DIR/chrome.stderr.log" &
  CHROME_PID=$!
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS --max-time 1 "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null 2>&1; then
      CDP_URL="http://127.0.0.1:$CDP_PORT"
      break
    fi
    sleep 1
  done
  if [ -z "$CDP_URL" ]; then
    kill "$CHROME_PID" 2>/dev/null || true
    set +e
    wait "$CHROME_PID"
    BROWSER_EXIT=$?
    set -e
    if [ "$BROWSER_EXIT" -eq 78 ]; then
      echo 'FAILED: BROWSER_UNAUTHORIZED_NETWORK; browser logs were not printed.' >&2
      exit 78
    fi
    echo "FAILED: BROWSER_LAUNCH_TIMEOUT; browser logs were not printed." >&2
    exit 1
  fi
fi


set +e
env -i \
  PATH="$PATH" \
  HOME="$HOME" \
  TMPDIR="${TMPDIR:-/tmp}" \
  USER="${USER:-}" \
  LOGNAME="${LOGNAME:-}" \
  LANG="${LANG:-C.UTF-8}" \
  LC_ALL="${LC_ALL:-C.UTF-8}" \
  CRAWL_MODE="deterministic-only" \
  CRAWL_BRAND="$BRAND" \
  CRAWL_COUNTRY="$COUNTRY" \
  CRAWL_RUN_DIR="$RUN_DIR" \
  CRAWL_SUMMARY_FILE="$SUMMARY_FILE" \
  CRAWL_CDP_URL="$CDP_URL" \
  LUXURY_PIPELINE_GUARD="enabled" \
  node "$PROJECT_DIR/scripts/network-isolate.mjs" "$(jq -c '.allowedHosts' "$COUNTRY_CONFIG")" "$CDP_PORT" \
  "$CRAWLER_ENTRY" --country-config "$COUNTRY_CONFIG" "$@" \
  >"$STDOUT_FILE" 2>"$STDERR_FILE"
CRAWL_EXIT=$?
set -e

cleanup_browser

if [ "$CRAWL_EXIT" -ne 0 ]; then
  FAILURE_CODE="UNKNOWN"
  if [ -f "$RUN_DIR/failure.json" ]; then
    FAILURE_CODE=$(sed -n 's/.*"failureCode":"\([A-Z_]*\)".*/\1/p' "$RUN_DIR/failure.json")
  fi
  if [ -f "$RUN_DIR/browser-network-status.json" ] && jq -e '.status == "blocked"' "$RUN_DIR/browser-network-status.json" >/dev/null; then
    FAILURE_CODE=BROWSER_UNAUTHORIZED_NETWORK
    CRAWL_EXIT=78
  fi
  chmod 000 "$STDOUT_FILE" "$STDERR_FILE" 2>/dev/null || true
  find "$RUN_DIR/raw" -type f -exec chmod 000 {} + 2>/dev/null || true
  echo "FAILED: $FAILURE_CODE (exit $CRAWL_EXIT); raw logs were not printed." >&2
  exit "$CRAWL_EXIT"
fi

"$PROJECT_DIR/scripts/crawl-output-guard.sh" "$SUMMARY_FILE"
for SUMMARY_PAGE in "$RUN_DIR"/summary-*.json; do
  [ -f "$SUMMARY_PAGE" ] || continue
  "$PROJECT_DIR/scripts/crawl-output-guard.sh" "$SUMMARY_PAGE" >/dev/null
done
chmod 000 "$STDOUT_FILE" "$STDERR_FILE" 2>/dev/null || true
find "$RUN_DIR/raw" -type f -exec chmod 000 {} + 2>/dev/null || true

echo "PASS: $BRAND/$COUNTRY summary validated at $SUMMARY_FILE"
