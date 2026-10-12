#!/bin/sh
set -eu

[ "${LUXURY_PIPELINE_GUARD:-}" = "enabled" ] || { echo "BLOCKED: central pipeline required." >&2; exit 1; }
[ "${LUXURY_NETWORK_ISOLATED:-}" = "enabled" ] || { echo "BLOCKED: kernel network isolation required." >&2; exit 1; }
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
RECORDS_FILE=${1:?records.json path required}
: "${SUPABASE_SERVICE_ROLE_KEY:?missing service role key}"
: "${CLOUDFLARE_API_TOKEN:?missing Cloudflare API token}"
SUPABASE_URL="https://nxgnbrdxxmlhtcnymqsl.supabase.co"
INGEST_BRAND=${LUXURY_INGEST_BRAND:-chanel}
case "$INGEST_BRAND" in
  chanel) BRAND_KO='샤넬'; BRAND_ORIGINAL='CHANEL' ;;
  prada) BRAND_KO='프라다'; BRAND_ORIGINAL='PRADA' ;;
  *) echo 'BLOCKED: unreviewed reference brand.' >&2; exit 2 ;;
esac
if ! jq -e 'length > 0 and all(.[]; .country == "KR" and .currency == "KRW" and (.normalizedCode | type == "string" and length > 0) and (.modelKey | type == "string" and length > 0))' "$RECORDS_FILE" >/dev/null; then
  echo 'BLOCKED: invalid Korean reference batch.' >&2; exit 2
fi

request() (
  request_method=$1 request_endpoint=$2 request_payload=${3:-} request_output_file=$4
  # Resolve existing rows before writes; preserve original first-seen dates.
  case "$request_method:$request_endpoint" in
    POST:*on_conflict=*)
      table=${request_endpoint%%\?*}
      columns=${request_endpoint##*on_conflict=}
      filters=$(printf '%s' "$request_payload" | jq -r --arg columns "$columns" '
        . as $row | $columns | split(",") | map(. as $key | $key + "=eq." + ($row[$key] | tostring | @uri)) | join("&")')
      existing=$(mktemp)
      request GET "$table?$filters&limit=1" '' "$existing"
      if jq -e 'length == 1' "$existing" >/dev/null; then
        row_id=$(jq -er '.[0].id' "$existing")
        request_payload=$(printf '%s' "$request_payload" | jq -c --slurpfile old "$existing" '
          del(.first_seen_at) | with_entries(select(.value != $old[0][0][.key]))')
        if [ "$request_payload" = '{}' ]; then
          cp "$existing" "$request_output_file"
          exit 0
        fi
        request_method=PATCH
        request_endpoint="$table?id=eq.$row_id"
      fi
      ;;
    PATCH:*)
      existing=$(mktemp)
      request GET "$request_endpoint&limit=1" '' "$existing"
      if jq -e 'length == 1' "$existing" >/dev/null; then
        request_payload=$(printf '%s' "$request_payload" | jq -c --slurpfile old "$existing" '
          del(.first_seen_at) | with_entries(select(.value != $old[0][0][.key]))')
        if [ "$request_payload" = '{}' ]; then
          cp "$existing" "$request_output_file"
          exit 0
        fi
      fi
      ;;
  esac
  if [ -n "$request_payload" ]; then
    code=$(curl -sS --max-time 30 -o "$request_output_file" -w '%{http_code}' -X "$request_method" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -H 'Content-Type: application/json' -H 'Prefer: resolution=merge-duplicates,return=representation' \
      --data "$request_payload" "$SUPABASE_URL/rest/v1/$request_endpoint")
  else
    code=$(curl -sS --max-time 30 -o "$request_output_file" -w '%{http_code}' -X "$request_method" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      "$SUPABASE_URL/rest/v1/$request_endpoint")
  fi
  case "$code" in
    200|201|204) ;;
    *)
      error_code=$(jq -r '.code // "unknown"' "$request_output_file" 2>/dev/null || echo unknown)
      echo "FAILED: database HTTP $code ($error_code)" >&2
      exit 1
      ;;
  esac
)

count=$(jq 'length' "$RECORDS_FILE")
stored=0
new_count=0
changed_count=0
unchanged_count=0
index=0
while [ "$index" -lt "$count" ]; do
  record=$(mktemp)
  jq ".[$index]" "$RECORDS_FILE" >"$record"
  checked=$(jq -r '.checkedAt' "$record")
  image_file=$(jq -r '.imagePath' "$record")
  image_sha=$(jq -r '.imageSha256' "$record")
  model_key=$(jq -r '.modelKey' "$record")
  product_code=$(jq -r '.normalizedCode' "$record")
  image_version=$(jq -r '.imageProcessingVersion // ""' "$record")
  [ "$image_version" = 'original-cutout-v1' ] || { echo 'BLOCKED: required image processing version missing'; exit 78; }
  object_key="products/$INGEST_BRAND/$model_key/$product_code/cutout-v1/$image_sha.webp"
  existing_image=$(mktemp)
  request GET "product_media?sha256=eq.$image_sha&r2_object_key=eq.$object_key&select=id&limit=1" '' "$existing_image"
  if ! jq -e 'length > 0' "$existing_image" >/dev/null; then
    # Same documented endpoint as the official CLI, with no package runner,
    # telemetry, updater, SDK, or extra outbound destinations involved.
    upload_response=$(mktemp)
    upload_code=$(curl -sS --max-time 60 -o "$upload_response" -w '%{http_code}' -X PUT \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H 'Content-Type: image/webp' -H 'Cache-Control: public, max-age=31536000, immutable' \
      --data-binary "@$image_file" \
      "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets/luxury-media/objects/$object_key")
    case "$upload_code" in 200|201|204) ;; *) echo 'FAILED: IMAGE_STORAGE_UPLOAD' >&2; exit 1;; esac
    verified_image=$(mktemp)
    verify_code=$(curl -sS --max-time 60 -o "$verified_image" -w '%{http_code}' \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets/luxury-media/objects/$object_key")
    [ "$verify_code" = 200 ] && [ "$(shasum -a 256 "$verified_image" | cut -d ' ' -f 1)" = "$image_sha" ] || {
      echo 'FAILED: IMAGE_STORAGE_VERIFY' >&2; exit 1;
    }
  fi

  response=$(mktemp)
  payload=$(jq -nc --arg slug "$INGEST_BRAND" --arg ko "$BRAND_KO" --arg original "$BRAND_ORIGINAL" '{slug:$slug,name_ko:$ko,name_original:$original,active:true}')
  request POST 'brands?on_conflict=slug' "$payload" "$response"
  brand_id=$(jq -er '.[0].id' "$response")

  response=$(mktemp)
  payload=$(jq -c --arg brand "$brand_id" '{brand_id:$brand,model_key:.modelKey,name_ko:.parentModel,name_original:.parentModel,active:true}' "$record")
  request POST 'product_models?on_conflict=brand_id,model_key' "$payload" "$response"
  model_id=$(jq -er '.[0].id' "$response")

  response=$(mktemp)
  payload=$(jq -c --arg brand "$brand_id" --arg model "$model_id" --arg checked "$checked" '
    {brand_id:$brand,model_id:$model,original_code:.originalCode,normalized_code:.normalizedCode,style_code:.styleCode,
     name_ko:.productName,name_original:.productName,material_ko:.materialDisplay,material_original:.materialOriginal,
     color_ko:.colorDisplay,color_original:.colorOriginal,width_mm:.widthMm,height_mm:.heightMm,depth_mm:.depthMm,
     active:true,first_seen_at:$checked,last_seen_at:$checked}' "$record")
  old_variant=$(mktemp)
  request GET "product_variants?brand_id=eq.$brand_id&normalized_code=eq.$product_code&limit=1" '' "$old_variant"
  is_new=$(jq 'length == 0' "$old_variant")
  variant_changed=$(printf '%s' "$payload" | jq --slurpfile old "$old_variant" '
    del(.first_seen_at,.last_seen_at) | to_entries | any(.[]; .value != $old[0][0][.key])')
  request POST 'product_variants?on_conflict=brand_id,normalized_code' "$payload" "$response"
  variant_id=$(jq -er '.[0].id' "$response")

  response=$(mktemp)
  payload=$(jq -c --arg variant "$variant_id" --arg checked "$checked" '
    {variant_id:$variant,country_code:.country,currency_code:.currency,official_product_code:.normalizedCode,
     official_name:.productName,official_url:.officialUrl,current_price:.price,price_status:.priceStatus,
     price_checked_at:(if .price==null then null else $checked end),page_checked_at:$checked,first_seen_at:$checked,last_seen_at:$checked}' "$record")
  old_market=$(mktemp)
  request GET "market_products?variant_id=eq.$variant_id&country_code=eq.KR&limit=1" '' "$old_market"
  if jq -e '.[0].current_price != null' "$old_market" >/dev/null && jq -e '.price == null' "$record" >/dev/null; then
    payload=$(printf '%s' "$payload" | jq 'del(.current_price,.price_status)')
  fi
  market_changed=$(printf '%s' "$payload" | jq --slurpfile old "$old_market" '
    del(.first_seen_at,.last_seen_at,.page_checked_at,.price_checked_at) | to_entries | any(.[]; .value != $old[0][0][.key])')
  request POST 'market_products?on_conflict=variant_id,country_code' "$payload" "$response"
  market_id=$(jq -er '.[0].id' "$response")

  current_price=$(jq -r '.price // empty' "$record")
  if [ -n "$current_price" ]; then
    latest=$(mktemp)
    request GET "price_history?market_product_id=eq.$market_id&select=amount&order=observed_at.desc&limit=1" '' "$latest"
    latest_price=$(jq -r '.[0].amount // empty' "$latest")
    if [ "$latest_price" != "$current_price" ] && [ "$latest_price" != "$current_price.00" ]; then
      response=$(mktemp)
      payload=$(jq -c --arg market "$market_id" --arg checked "$checked" '{market_product_id:$market,amount:.price,currency_code:.currency,observed_at:$checked,source_url:.officialUrl}' "$record")
      request POST 'price_history' "$payload" "$response"
    fi
  fi

  payload=$(jq -c --arg variant "$variant_id" --arg object "$object_key" --arg checked "$checked" '
    {variant_id:$variant,r2_object_key:$object,public_url:null,source_url:.sourceImageUrl,sha256:.imageSha256,
     mime_type:.imageMimeType,width:.imageWidth,height:.imageHeight,byte_size:.imageBytes,is_primary:true,source_checked_at:$checked}' "$record")
  primary=$(mktemp)
  request GET "product_media?variant_id=eq.$variant_id&is_primary=eq.true&select=id,sha256&limit=1" '' "$primary"
  primary_id=$(jq -r '.[0].id // empty' "$primary")
  response=$(mktemp)
  if [ -n "$primary_id" ]; then
    request PATCH "product_media?id=eq.$primary_id" "$payload" "$response"
  else
    request POST 'product_media?on_conflict=variant_id,sha256' "$payload" "$response"
  fi
  if [ "$is_new" = true ]; then
    new_count=$((new_count + 1))
  elif [ "$variant_changed" = true ] || [ "$market_changed" = true ] || [ "$(jq -r '.[0].sha256 // empty' "$primary")" != "$image_sha" ]; then
    changed_count=$((changed_count + 1))
  else
    unchanged_count=$((unchanged_count + 1))
  fi
  stored=$((stored + 1))
  index=$((index + 1))
done

if [ -n "${LUXURY_SERVICE_STATE_DIR:-}" ]; then
  jq -nc --argjson new "$new_count" --argjson changed "$changed_count" --argjson unchanged "$unchanged_count" \
    '{new:$new,changed:$changed,unchanged:$unchanged}' >"$LUXURY_SERVICE_STATE_DIR/ingest-counts.json"
fi
jq -nc --argjson stored "$stored" '{status:"stored",records:$stored}'
