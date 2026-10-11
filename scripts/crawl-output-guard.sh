#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$PROJECT_DIR/scripts/crawler-env.sh"
GUARD_FILE="$PROJECT_DIR/crawler/guardrails.json"
SUMMARY_FILE=${1:-}

if [ -z "$SUMMARY_FILE" ] || [ ! -f "$SUMMARY_FILE" ]; then
  echo "BLOCKED: summary.json is missing." >&2
  exit 1
fi

MAX_BYTES=$(jq -r '.limits.maxSummaryBytesPerRun' "$GUARD_FILE")
MAX_RECORDS=$(jq -r '.limits.maxSummaryRecordsPerRun' "$GUARD_FILE")
ACTUAL_BYTES=$(wc -c < "$SUMMARY_FILE" | tr -d ' ')

if [ "$ACTUAL_BYTES" -gt "$MAX_BYTES" ]; then
  echo "BLOCKED: summary exceeds ${MAX_BYTES} bytes." >&2
  exit 1
fi

if ! jq -e 'type == "array"' "$SUMMARY_FILE" >/dev/null; then
  echo "BLOCKED: summary must be a JSON array." >&2
  exit 1
fi

RECORDS=$(jq 'length' "$SUMMARY_FILE")
if [ "$RECORDS" -gt "$MAX_RECORDS" ]; then
  echo "BLOCKED: summary exceeds ${MAX_RECORDS} records." >&2
  exit 1
fi

if ! jq -e '
  all(.[];
    type == "object" and
    (keys - ["brand","country","parentModel","variantCode","price","currency","status","officialUrl"] | length == 0) and
    has("brand") and has("country") and has("parentModel") and has("variantCode") and
    has("price") and has("currency") and has("status") and has("officialUrl")
  )' "$SUMMARY_FILE" >/dev/null; then
  echo "BLOCKED: summary contains missing or unapproved fields." >&2
  exit 1
fi

if rg -q -i '(<html|<!doctype|<script|data:[^;]+;base64|base64,|stack trace|traceback|"html"[[:space:]]*:)' "$SUMMARY_FILE"; then
  echo "BLOCKED: raw page, base64, or stack-trace content detected in summary." >&2
  exit 1
fi

if ! jq -e 'all(.[];
  (.brand | type == "string" and length <= 40) and
  (.country | type == "string" and length <= 3) and
  (.parentModel | type == "string" and length <= 120) and
  (.variantCode | type == "string" and length <= 120) and
  ((.price == null) or (.price | type == "number")) and
  (.currency | type == "string" and length <= 3) and
  (.status | type == "string" and length <= 40) and
  (.officialUrl | type == "string" and length <= 500 and startswith("https://"))
)' "$SUMMARY_FILE" >/dev/null; then
  echo "BLOCKED: summary field type or length violation." >&2
  exit 1
fi

echo "PASS: summary is token-safe (${ACTUAL_BYTES} bytes, ${RECORDS} records)."
