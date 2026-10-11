#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="nxgnbrdxxmlhtcnymqsl"
if [ -n "${EXPO_PUBLIC_SUPABASE_KEY:-}" ] && [ "${EXPO_PUBLIC_SUPABASE_URL:-}" = "https://${PROJECT_REF}.supabase.co" ]; then
  cd "$(dirname "$0")/../app"
  exec "$@"
fi
ACCESS_TOKEN=$(security find-generic-password -s 'carrywise.supabase.access-token' -a 'carrywise-project' -w 2>/dev/null) \
  || { echo 'Supabase access token not found in macOS Keychain.' >&2; exit 1; }
KEYS_JSON=$(SUPABASE_ACCESS_TOKEN="$ACCESS_TOKEN" supabase projects api-keys --project-ref "$PROJECT_REF" --output json 2>/dev/null)
PUBLIC_KEY=$(printf '%s' "$KEYS_JSON" | jq -r 'map(select(.type == "publishable" or .name == "anon"))[0].api_key // empty')
test -n "$PUBLIC_KEY" || { echo 'Supabase public client key not found.' >&2; exit 1; }

export EXPO_PUBLIC_SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
export EXPO_PUBLIC_SUPABASE_KEY="$PUBLIC_KEY"
export EXPO_PUBLIC_ASSET_BASE_URL="https://luxury-assets.dailyhotcoolmeme.workers.dev"

cd "$(dirname "$0")/../app"
exec "$@"
