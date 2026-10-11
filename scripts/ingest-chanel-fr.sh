#!/bin/sh
set -eu
exec node "$(dirname "$0")/ingest-chanel-jp.mjs" "$1" FR
