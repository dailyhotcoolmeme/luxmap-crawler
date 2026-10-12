#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$PROJECT_DIR"
. "$PROJECT_DIR/scripts/crawler-env.sh"
GUARD_FILE="$PROJECT_DIR/crawler/guardrails.json"

"$PROJECT_DIR/scripts/crawl-preflight.sh" >/dev/null

jq -e '.failClosed == true and .requireCentralPipeline == true and .allowModelApis == false' \
  "$GUARD_FILE" >/dev/null || { echo "BLOCKED: fail-closed token policy missing." >&2; exit 1; }

EXPECTED_DEPS=$(jq -c '.allowedRuntimeDependencies | sort' "$GUARD_FILE")
ACTUAL_DEPS=$(jq -c '(.dependencies // {}) | keys | sort' "$PROJECT_DIR/package.json")
[ "$EXPECTED_DEPS" = "$ACTUAL_DEPS" ] || { echo "BLOCKED: runtime dependency allowlist mismatch." >&2; exit 1; }
EXPECTED_IMAGE_DEPS=$(jq -c '.imageProcessing.runtimeDependencies | sort' "$GUARD_FILE")
ACTUAL_IMAGE_DEPS=$(jq -Rsc 'split("\n") | map(select(length > 0)) | sort' "$PROJECT_DIR/crawler/common/cutout-requirements.txt")
[ "$EXPECTED_IMAGE_DEPS" = "$ACTUAL_IMAGE_DEPS" ] || { echo 'BLOCKED: image runtime dependency allowlist mismatch.' >&2; exit 78; }
jq -e '.imageProcessing.requireOfflineCpu == true and .imageProcessing.version == "original-cutout-v1"' "$GUARD_FILE" >/dev/null || exit 78

FORBIDDEN='(openai|anthropic|claude|gemini|generativelanguage|cohere|mistral|huggingface|ollama|langchain|llamaindex|bedrock|vertexai|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|security[[:space:]]+find-generic-password)'
if rg -n -i --glob '!token-safety-gate.sh' --glob '!crawl-preflight.sh' --glob '!run-brand-country-pipeline.sh' \
  --glob '!build-android-release.sh' --glob '!with-supabase-env.sh' --glob '!AGENTS.md' --glob '!PRODUCT_SPEC.md' \
  "$FORBIDDEN" "$PROJECT_DIR/crawler/brands" "$PROJECT_DIR/scripts" >/dev/null 2>&1; then
  echo "BLOCKED: forbidden model, credential, or keychain reference detected." >&2
  exit 1
fi

if jq -r '.packages // {} | to_entries[] | (.value.dependencies // {}),(.value.optionalDependencies // {}) | keys[]?' \
  "$PROJECT_DIR/package-lock.json" | rg -i 'openai|anthropic|gemini|cohere|mistral|huggingface|ollama|langchain|llamaindex' >/dev/null; then
  echo "BLOCKED: model dependency detected in lockfile." >&2
  exit 1
fi

find "$PROJECT_DIR/crawler/brands" -mindepth 2 -maxdepth 2 -type f -name crawler -perm -111 | while read -r crawler; do
  brand_dir=$(dirname "$crawler")
  [ -d "$brand_dir/countries" ] || { echo "BLOCKED: countries config missing for $brand_dir." >&2; exit 1; }
  for config in "$brand_dir"/countries/*; do
    jq -e '.allowedHosts | type == "array" and length > 0' "$config" >/dev/null || {
      echo "BLOCKED: allowedHosts missing in $config." >&2
      exit 1
    }
  done
done

echo "PASS: model-token safety gate is active."
