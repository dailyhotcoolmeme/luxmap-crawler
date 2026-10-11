#!/bin/sh
# Shared tool discovery for interactive terminals and scheduled clean environments.
# Keep the caller's PATH first; use installed local tools only, never download.
for tool_dir in /opt/homebrew/bin /usr/local/bin "$HOME/.aside/runtime/bin"; do
  if [ -d "$tool_dir" ]; then
    case ":$PATH:" in
      *":$tool_dir:"*) ;;
      *) PATH="$PATH:$tool_dir" ;;
    esac
  fi
done
export PATH

for required_tool in rg jq node curl; do
  if ! command -v "$required_tool" >/dev/null 2>&1; then
    echo "FAILED: REQUIRED_TOOL_UNAVAILABLE ($required_tool)." >&2
    exit 1
  fi
done
