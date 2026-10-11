#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$PROJECT_DIR"
. "$PROJECT_DIR/scripts/crawler-env.sh"
GUARD_FILE="$PROJECT_DIR/crawler/guardrails.json"

if [ ! -f "$GUARD_FILE" ]; then
  echo "BLOCKED: crawler/guardrails.json is missing." >&2
  exit 1
fi

if ! rg -q '"mode"[[:space:]]*:[[:space:]]*"deterministic-only"' "$GUARD_FILE"; then
  echo "BLOCKED: deterministic-only mode is not enabled." >&2
  exit 1
fi

if ! rg -q '"allowModelApis"[[:space:]]*:[[:space:]]*false' "$GUARD_FILE"; then
  echo "BLOCKED: model APIs are not explicitly disabled." >&2
  exit 1
fi

if ! rg -q '"allowWebSearchAsCrawler"[[:space:]]*:[[:space:]]*false' "$GUARD_FILE"; then
  echo "BLOCKED: web search crawling is not explicitly disabled." >&2
  exit 1
fi

if rg -l -i --glob '!crawl-preflight.sh' --glob '!token-safety-gate.sh' --glob '!AGENTS.md' --glob '!PRODUCT_SPEC.md' --glob '!guardrails.json' \
  '(openai|anthropic|gemini|generativelanguage|api\.openai\.com|api\.anthropic\.com|generativeai|cohere|mistral|huggingface|langchain|llamaindex)' \
  "$PROJECT_DIR/crawler/brands" "$PROJECT_DIR/crawler/common" "$PROJECT_DIR/scripts" 2>/dev/null; then
  echo "BLOCKED: model API or SDK reference detected in crawler code." >&2
  exit 1
fi

for MANIFEST in $(find "$PROJECT_DIR/crawler/brands" "$PROJECT_DIR/crawler/common" -type f \( -name 'package.json' -o -name 'requirements*.txt' -o -name 'pyproject.toml' -o -name 'Cargo.toml' \) 2>/dev/null); do
  if rg -n -i '(openai|anthropic|gemini|generative-ai|langchain|llamaindex|cohere|mistral)' "$MANIFEST" >/dev/null; then
    echo "BLOCKED: model dependency detected in crawler manifest." >&2
    exit 1
  fi
done

echo "PASS: deterministic crawler guardrails are active."
