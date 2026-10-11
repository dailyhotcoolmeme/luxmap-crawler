#!/bin/sh
set -eu
if [ "${LUXURY_INGEST_BRAND:-chanel}" = prada ]; then
 exec node "$(dirname "$0")/ingest-prada-country.mjs" "$1"
fi
exec node "$(dirname "$0")/ingest-chanel-jp.mjs" "$1" "${LUXURY_MARKET_COUNTRY:?country required}"
