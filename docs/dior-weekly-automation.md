최신 주간 계약은 [weekly-product-maintenance.md](weekly-product-maintenance.md)를 따른다. 아래 과거 통합 등록 설명은 신규 SKU에만 적용하며 기존 한국 SKU는 가격만 갱신한다. 첫 원격 실행39183933588은 실패했고 예약 등록을 수집 성공으로 간주하지 않는다.

# Dior verified-route weekly collection

The owner approved publishing and executing this integration on 2026-10-19.
The existing Monday 09:00 Asia/Seoul `crawler.yml` / `crawler/schedule.json`
path now includes Dior KR and JP/FR/IT/ES/US/SG/HK. Other brand schedules and
the deleted model automation / supervisor are unchanged.

## What is deployed

- KR: one exact product source supplies name, KRW, original view, color,
  material and dimensions. Already verified non-null attributes are retained
  when a new source omits them. A changed repaired image view is rejected.
  Original CPU cutout, CPU person rejection, mask quality, R2 and anonymous
  catalogue verification remain mandatory. No generated product images.
- Foreign: the same registered KR codes only; explicit local currency,
  exact own SKU/option/listing price and local canonical. No foreign
  attributes or photos. Central market storage, changed-only histories and
  independent anonymous price/history readback are reused.
- `published-routes/` is reviewed deployment configuration: public canonical
  and data URLs with publication/response provenance hashes and times, not
  raw responses, prices, images, credentials, checkpoints or local paths.
  KR `posted-rule-public-canonical` entries bind the successful published
  Next framework rule/control to independently public-verified KR canonical
  URLs; they do not claim that every derived URL had already returned 200.
- The build segment is the actually published/proven build. An expired
  build, 404, denial or timeout is recorded, not guessed around. New builds
  require newly verified publication evidence; no fabricated build IDs.
- Each worker retains 25 products / 80 requests / 30 seconds / 8 MiB and the
  existing coordinator shared lease and host isolation. No model calls.
- Failures are durable by URL hash, saved before I/O. Only denial receipts
  are cached between Actions runs, never raw responses or credentials.
  Historic failed URL hashes were compiled from guarded local receipts.
- The existing live progress Check shows current-run price timestamps vs
  existing totals. Final `guarded-summary` contains country counts/failures.
- After HK, the existing app calculation code refreshes the shared snapshot
  under its own existing DB lease and compares the public snapshot. The
  generated calculation module is a mechanical copy of the app calculation,
  not a second tax/refund implementation or an app UI change.

## Baseline and honest limits

Before deployment: registered KR 352, color347/material352/dimensions352;
foreign JP306/FR314/IT314/ES313/US311/SG321/HK319 =2198/2464;
unconfirmed266 country-SKU pairs. Five colors remain unresolved. Candidate
990 / unconfirmed638 is a separate discovery universe, not proven bags.
These are not new Actions results or a promise of every country price.

The independent discovery audit is retained and global incompleteness stays
non-success. A KR partial status2 permits foreign refresh of independently
verified registered products, while the overall workflow stays incomplete.
No safety78 is downgraded. A sample is never reported as a full run.

Local deployment checks: the new KR path actually processed/stored/anonymous-
verified one product. The new JP path actually stored/anonymous-verified two
exact code prices from one own product/option response. A counter expecting
another adapter's receipt was corrected to `PUBLIC_COUNTRY_PRICE_VERIFIED`.
Remote execution status must be checked separately in Actions and public DB.
