// Generated from the app calculation sources. No product data or credentials.
const factories={
"cloudflare/catalog-comparison.ts":(module,exports,require)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalogSnapshotKey = void 0;
exports.savedCatalogEstimates = savedCatalogEstimates;
exports.refreshSavedCatalog = refreshSavedCatalog;
const comparison_service_1 = require("./comparison-service");
const comparison_1 = require("../app/src/lib/comparison");
const comparison_cache_1 = require("../app/src/lib/comparison-cache");
const catalog_snapshot_1 = require("../app/src/lib/catalog-snapshot");
const product_kind_1 = require("../app/src/lib/product-kind");
exports.catalogSnapshotKey = 'internal/catalog-comparison/current.json';
const koreanDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const normalize = (code) => code.toUpperCase().replace(/[\s-]/g, '');
const priceOf = (market) => market.current_price !== null && Number.isFinite(Number(market.current_price)) && Number(market.current_price) > 0 ? Number(market.current_price) : null;
function savedCatalogEstimates(products, context) {
    return products.map(product => {
        const domesticMarket = product.market_products.find(market => market.country_code === 'KR');
        if (!domesticMarket)
            throw new Error('Korean reference missing');
        const domestic = priceOf(domesticMarket);
        let best = null;
        for (const market of product.market_products) {
            if (market.country_code === 'KR' || normalize(market.official_product_code) !== normalize(product.normalized_code))
                continue;
            const price = priceOf(market);
            if (price === null)
                continue;
            const result = (0, comparison_1.calculateComparison)(price, market.country_code, market.currency_code, context, comparison_1.emptyConditions, (0, product_kind_1.productKind)({ brandSlug: product.brands?.slug }) === 'jewelry' ? 'jewelry' : 'bag');
            if (result?.total == null || best && best.total <= result.total)
                continue;
            const saving = domestic === null ? null : domestic - result.total;
            best = { id: product.id, country: market.country_code, total: result.total, saving, savingRate: domestic && saving !== null ? saving / domestic : null };
        }
        return best ?? { id: product.id, country: null, total: null, saving: null, savingRate: null };
    });
}
async function refreshSavedCatalog(env) {
    const day = koreanDay();
    const state = (await (0, comparison_service_1.queryReference)(env, 'comparison_catalog_state?select=revision&limit=1'))[0];
    const oldObject = await env.LUXURY_MEDIA.get(exports.catalogSnapshotKey);
    const old = oldObject ? await oldObject.json() : null;
    if (old?.revision === state.revision && old.day === day && old.calculationVersion === comparison_cache_1.CALCULATION_VERSION && old.categoryVersion === 2)
        return { status: 'unchanged', products: old.products };
    const token = crypto.randomUUID();
    const lease = (await (0, comparison_service_1.queryReference)(env, 'rpc/claim_catalog_comparison', { method: 'POST', body: JSON.stringify({ p_token: token }) }))[0];
    if (!lease)
        return { status: 'locked' };
    try {
        const [fx, versions] = await Promise.all([
            (0, comparison_service_1.queryReference)(env, 'comparison_fx_snapshots?select=provider_updated_at,collected_at,krw_per_unit&order=provider_updated_at.desc&limit=1'),
            (0, comparison_service_1.queryReference)(env, `comparison_rule_versions?effective_from=lte.${day}&select=version,config&order=effective_from.desc,created_at.desc&limit=1`),
        ]);
        if (!fx[0] || !versions[0])
            throw new Error('Stored references unavailable');
        const context = { rates: fx[0].krw_per_unit, rateUpdatedAt: fx[0].provider_updated_at, collectedAt: fx[0].collected_at, evaluatedAt: new Date().toISOString(), rules: versions[0].config };
        const products = [];
        for (let offset = 0;; offset += 500) {
            const page = await (0, comparison_service_1.queryReference)(env, `product_variants?active=eq.true&select=id,normalized_code,brands(slug),market_products(country_code,currency_code,current_price,official_product_code)&order=id&limit=500&offset=${offset}`);
            products.push(...page);
            if (page.length < 500)
                break;
        }
        if (!products.length)
            throw new Error('Catalog empty');
        const estimates = savedCatalogEstimates(products, context);
        const current = (await (0, comparison_service_1.queryReference)(env, 'comparison_catalog_state?select=revision,lease_token,lease_until&limit=1'))[0];
        if (current.revision !== lease.revision || current.lease_token !== token || Date.parse(current.lease_until) < Date.now() + 10000 || koreanDay() !== day)
            throw new Error('Catalog changed during refresh');
        const snapshot = { schema: 1, categoryVersion: 2, revision: lease.revision, day, calculationVersion: comparison_cache_1.CALCULATION_VERSION, calculatedAt: new Date().toISOString(), fxUpdatedAt: context.rateUpdatedAt, ruleVersion: versions[0].version, products: products.length, estimates };
        if (!(0, catalog_snapshot_1.validCatalogSnapshot)(snapshot))
            throw new Error('Snapshot validation failed');
        await env.LUXURY_MEDIA.put(exports.catalogSnapshotKey, JSON.stringify(snapshot), { httpMetadata: { contentType: 'application/json' } });
        return { status: 'stored', products: products.length, priced: estimates.filter(row => row.total !== null).length, revision: lease.revision };
    }
    finally {
        await (0, comparison_service_1.queryReference)(env, 'rpc/release_catalog_comparison', { method: 'POST', body: JSON.stringify({ p_token: token }) });
    }
}

},
"cloudflare/comparison-service.ts":(module,exports,require)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryReference = queryReference;
exports.refreshComparisonFx = refreshComparisonFx;
exports.comparisonContext = comparisonContext;
exports.calculatorContext = calculatorContext;
const database = 'https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/';
async function queryReference(env, path, init = {}) {
    const result = await fetch(database + path, { ...init, headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', ...init.headers }, signal: AbortSignal.timeout(15000) });
    if (!result.ok)
        throw new Error(`Reference database HTTP ${result.status}`);
    const body = await result.text();
    return body ? JSON.parse(body) : null;
}
async function refreshComparisonFx(env) {
    const latest = await queryReference(env, 'comparison_fx_snapshots?select=collected_at&order=provider_updated_at.desc&limit=1');
    const koreanDate = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(value));
    if (latest[0] && koreanDate(latest[0].collected_at) === koreanDate(Date.now()))
        return { status: 'already_collected' };
    const response = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(15000) });
    if (!response.ok)
        throw new Error(`FX provider HTTP ${response.status}`);
    const body = await response.json();
    const currencies = ['KRW', 'USD', 'JPY', 'EUR', 'SGD', 'HKD'];
    if (body.result !== 'success' || body.base_code !== 'USD' || !Number.isFinite(body.time_last_update_unix) || currencies.some(code => !Number.isFinite(body.rates?.[code]) || body.rates[code] <= 0))
        throw new Error('Invalid FX observation');
    const updatedAt = new Date(body.time_last_update_unix * 1000).toISOString();
    if (Date.parse(updatedAt) > Date.now() + 60000 || Date.now() - Date.parse(updatedAt) > 3 * 86400000)
        throw new Error('FX observation timestamp rejected');
    const rates = Object.fromEntries(currencies.map(code => [code, body.rates.KRW / body.rates[code]]));
    await queryReference(env, 'comparison_fx_snapshots?on_conflict=provider_updated_at', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ provider_updated_at: updatedAt, collected_at: new Date().toISOString(), source_url: 'https://open.er-api.com/v6/latest/USD', krw_per_unit: rates }) });
    return { status: 'stored', updatedAt };
}
async function comparisonContext(env, variant) {
    const products = await queryReference(env, `product_variants?id=eq.${variant}&active=eq.true&select=id,market_products(currency_code)&limit=1`);
    if (!products[0])
        return null;
    const context = await calculatorContext(env);
    const currencies = new Set(['USD', 'KRW', ...products[0].market_products.map((market) => market.currency_code)]);
    return { ...context, rates: Object.fromEntries(Object.entries(context.rates).filter(([code]) => currencies.has(code))) };
}
// Stored comparison references only: no provider call and no database write.
async function calculatorContext(env) {
    const [observations, versions] = await Promise.all([
        queryReference(env, 'comparison_fx_snapshots?select=provider_updated_at,collected_at,krw_per_unit&order=provider_updated_at.desc&limit=1'),
        queryReference(env, `comparison_rule_versions?effective_from=lte.${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())}&select=config&order=effective_from.desc,created_at.desc&limit=1`),
    ]);
    if (!observations[0] || !versions[0])
        throw new Error('Comparison references not provisioned');
    const currencies = new Set(['USD', 'KRW', 'EUR', 'JPY', 'SGD', 'HKD']);
    const rates = Object.fromEntries(Object.entries(observations[0].krw_per_unit).filter(([code]) => currencies.has(code)));
    return { rates, rateUpdatedAt: observations[0].provider_updated_at, collectedAt: observations[0].collected_at, evaluatedAt: new Date().toISOString(), rules: versions[0].config };
}

},
"app/src/lib/comparison.ts":(module,exports,require)=>{
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.comparisonDate = exports.emptyConditions = void 0;
exports.resolvedComparisonRules = resolvedComparisonRules;
exports.parseAmount = parseAmount;
exports.baselineRefundRate = baselineRefundRate;
exports.basicTax = basicTax;
exports.calculateComparison = calculateComparison;
const comparison_defaults_json_1 = __importDefault(require("../data/comparison-defaults.json"));
function resolvedComparisonRules(context) {
    const live = context?.rules;
    return {
        ...comparison_defaults_json_1.default, ...live,
        tax: { ...comparison_defaults_json_1.default.tax, ...live?.tax }, card: { ...comparison_defaults_json_1.default.card, ...live?.card },
        salesTax: { US: { ...comparison_defaults_json_1.default.salesTax.US, ...live?.salesTax?.US } },
        refund: Object.fromEntries([...new Set([...Object.keys(comparison_defaults_json_1.default.refund), ...Object.keys(live?.refund ?? {})])]
            .map(country => [country, { ...comparison_defaults_json_1.default.refund[country], ...live?.refund?.[country] }])),
        sources: [...(live?.sources ?? []), ...comparison_defaults_json_1.default.sources].filter((source, index, all) => all.findIndex(item => item.url === source.url) === index),
    };
}
exports.emptyConditions = { exchange: '', finalPrice: '', discount: '', discountMode: 'amount', coupon: '', storeDiscount: '', refund: '', refundMode: 'amount', refundEnabled: true, purchasePlace: 'general', fee: '', feeMode: 'percent', payment: 'card', declared: true, purchaseDate: '' };
function parseAmount(value) {
    if (!value.trim() || !/^\d+(\.\d+)?$/.test(value))
        return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
}
const round = (value) => Math.round(value);
const comparisonDate = (context, input) => input.purchaseDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(context?.evaluatedAt ?? Date.now()));
exports.comparisonDate = comparisonDate;
// Baseline percentage for the editable purchase-conditions form before a
// product amount is known. Price thresholds/tiers still use the normal engine.
function baselineRefundRate(country, context, input) {
    if (!input.refundEnabled)
        return 0;
    const rules = resolvedComparisonRules(context);
    if (country === 'JP') {
        const jp = rules.refund.JP, reformed = (0, exports.comparisonDate)(context, input) >= jp.reformDate;
        const fee = reformed ? jp.reformEstimatedFeeNetRate : input.purchasePlace === 'direct' ? 0 : jp.counterFeeNetRate;
        return Math.max(0, jp.vatRate - fee) / (1 + jp.vatRate);
    }
    if (country === 'ES')
        return rules.refund.ES.smallRate;
    return rules.refund[country]?.generalRate ?? 0;
}
function basicTax(taxable, rules, kind = 'bag') {
    const threshold = kind === 'bag' ? rules.tax.bagThreshold : rules.tax.jewelryThreshold;
    return Math.max(0, Math.floor((Math.min(taxable, threshold) * rules.tax.lowRate + Math.max(0, taxable - threshold) * rules.tax.highRate) / 10) * 10);
}
function calculateComparison(price, country, currency, context, input, kind = 'bag') {
    if (!/^[A-Z]{2}$/.test(country))
        return null;
    const domestic = country === 'KR';
    const rules = resolvedComparisonRules(context);
    if (!Object.prototype.hasOwnProperty.call(rules.refund, country))
        return null;
    const rate = domestic ? 1 : parseAmount(input.exchange) ?? context?.rates[currency] ?? null;
    const original = parseAmount(input.finalPrice) ?? price;
    if (original === null || rate === null || rate <= 0)
        return null;
    if (!Number.isFinite(original * rate) || (input.discountMode === 'percent' && (parseAmount(input.discount) ?? 0) > 100) || (input.refundMode === 'percent' && (parseAmount(input.refund) ?? 0) > 100))
        return null;
    const explicitFinal = parseAmount(input.finalPrice) !== null;
    const discount = explicitFinal ? 0 : input.discountMode === 'percent' ? original * (parseAmount(input.discount) ?? 0) / 100 : parseAmount(input.discount) ?? 0;
    if ((input.couponMode === 'percent' && (parseAmount(input.coupon) ?? 0) > 100) || (input.storeDiscountMode === 'percent' && (parseAmount(input.storeDiscount) ?? 0) > 100))
        return null;
    const coupon = explicitFinal ? 0 : input.couponMode === 'percent' ? Math.max(0, original - discount) * (parseAmount(input.coupon) ?? 0) / 100 : parseAmount(input.coupon) ?? 0;
    const storeDiscount = explicitFinal ? 0 : input.storeDiscountMode === 'percent' ? Math.max(0, original - discount - coupon) * (parseAmount(input.storeDiscount) ?? 0) / 100 : parseAmount(input.storeDiscount) ?? 0;
    if (discount + coupon + storeDiscount > original)
        return null;
    const paidLocal = original - discount - coupon - storeDiscount;
    const date = (0, exports.comparisonDate)(context, input);
    const refundRules = { ...comparison_defaults_json_1.default.refund, ...rules.refund };
    const japanReformed = country === 'JP' && date >= rules.refund.JP.reformDate;
    let refundLocal = 0;
    let refundRate = 0;
    let refundMaximum = null;
    let refundLabel = '환급 없음';
    if (country === 'US')
        refundLabel = '기본 환급 없음 · 일반 매장에서는 낸 판매세를 돌려주지 않습니다';
    if (country === 'HK')
        refundLabel = '없음 · 부가세가 붙지 않아 돌려받을 세금도 없습니다';
    if (!domestic && input.refundEnabled) {
        const override = parseAmount(input.refund);
        if (override !== null) {
            refundLocal = input.refundMode === 'percent' ? paidLocal * override / 100 : override;
            refundLabel = '직접 입력';
        }
        else if (country === 'FR') {
            refundRate = paidLocal >= rules.refund.FR.minimumGross ? rules.refund.FR.generalRate : 0;
            refundLocal = paidLocal * refundRate;
            refundLabel = '프랑스 일반 예상';
        }
        else if (country === 'IT') {
            refundLocal = paidLocal >= refundRules.IT.minimumGross ? paidLocal * refundRules.IT.generalRate : 0;
            refundLabel = `이탈리아 일반 예상 · 참고 상한 ${(refundRules.IT.referenceMaximumRate * 100).toFixed(1)}%`;
        }
        else if (country === 'ES') {
            const es = refundRules.ES;
            if (paidLocal <= es.smallMaximum)
                refundLocal = paidLocal * es.smallRate;
            else if (paidLocal <= 1000)
                refundLocal = es.fixedAmounts[es.fixedUpperBounds.findIndex(bound => paidLocal <= bound)];
            else {
                const index = es.rateUpperBounds.findIndex(bound => paidLocal <= bound);
                refundLocal = paidLocal * (index < 0 ? es.topRate : es.rates[index]);
            }
            refundLabel = '스페인 주요 판매처 예상';
        }
        else if (country === 'SG') {
            refundMaximum = paidLocal >= refundRules.SG.minimumGross ? round(paidLocal * refundRules.SG.vatRate / (1 + refundRules.SG.vatRate) * rate) : 0;
            refundLocal = refundMaximum === 0 ? 0 : Math.min(paidLocal * refundRules.SG.generalRate, paidLocal * refundRules.SG.vatRate / (1 + refundRules.SG.vatRate));
            refundLabel = refundMaximum === 0 ? '최소 구매액 미달' : '싱가포르 일반 예상';
        }
        else if (country === 'JP') {
            if (japanReformed) {
                refundMaximum = paidLocal / (1 + refundRules.JP.vatRate) >= refundRules.JP.minimumNet ? round(paidLocal * refundRules.JP.vatRate / (1 + refundRules.JP.vatRate) * rate) : 0;
                refundLocal = refundMaximum === 0 ? 0 : Math.floor(paidLocal / (1 + refundRules.JP.vatRate) * Math.max(0, refundRules.JP.vatRate - refundRules.JP.reformEstimatedFeeNetRate));
                refundLabel = refundMaximum === 0 ? '최소 구매액 미달' : '일본 개편 후 예상';
            }
            else {
                const vat = rules.refund.JP.vatRate;
                const counterFee = input.purchasePlace === 'direct' ? 0 : rules.refund.JP.counterFeeNetRate;
                refundLocal = paidLocal / (1 + vat) >= rules.refund.JP.minimumNet ? Math.floor(paidLocal / (1 + vat) * (vat - counterFee)) : 0;
                refundRate = (vat - counterFee) / (1 + vat);
                refundLabel = input.purchasePlace === 'direct' ? '일본 환급 수수료 없음' : '일본 환급 수수료 반영';
            }
        }
        else if (!['KR', 'US', 'HK'].includes(country)) {
            const generic = refundRules[country];
            if (typeof generic?.generalRate !== 'number')
                return null;
            refundLocal = paidLocal >= (generic.minimumGross ?? 0) ? paidLocal * generic.generalRate : 0;
            refundLabel = '기본 예상';
        }
    }
    if (!input.refundEnabled)
        refundLabel = '미적용';
    refundRate = paidLocal > 0 ? refundLocal / paidLocal : 0;
    if (refundLocal < 0 || refundLocal > paidLocal || !Number.isFinite(refundLocal))
        return null;
    const gross = round(paidLocal * rate);
    const refund = round(refundLocal * rate);
    const localTaxEstimated = country === 'US' && !explicitFinal;
    const localTaxRate = localTaxEstimated ? rules.salesTax.US.generalRate : 0;
    const localTax = round(paidLocal * localTaxRate * rate);
    const localTaxLabel = localTaxEstimated ? `${rules.salesTax.US.referenceLocation} 기준 예상` : country === 'US' ? '입력한 가격에 포함' : '상품 가격에 포함';
    // JP direct exemption is deducted before card approval; counters/FR refund later.
    const instant = country === 'JP' && !japanReformed && input.purchasePlace === 'direct';
    const cardBase = instant ? gross - refund : gross + localTax;
    const enteredFee = parseAmount(input.fee);
    const feeRate = input.feeMode === 'percent' ? (enteredFee ?? rules.card.defaultRate * 100) / 100 : null;
    const fee = domestic || input.payment === 'cash' ? 0 : input.feeMode === 'amount' ? round((enteredFee ?? 0) * rate) : round(cardBase * (feeRate ?? 0));
    // Optional values use documented estimates; a tax-inclusive final price
    // overrides the estimate rather than receiving sales tax a second time.
    const spend = gross + localTax - refund + fee;
    const allowance = domestic ? 0 : context?.rates.USD ? round(context.rates.USD * rules.tax.allowanceUsd) : null;
    const taxable = allowance !== null ? Math.max(0, gross + localTax - refund - allowance) : null;
    const tax = domestic ? 0 : taxable !== null ? basicTax(taxable, rules, kind) : null;
    const relief = tax === null ? null : Math.floor(Math.min(tax * rules.tax.declarationDiscount, rules.tax.declarationDiscountCap) / 10) * 10;
    const surcharge = tax === null ? null : Math.floor(tax * rules.tax.firstSurcharge / 10) * 10;
    const entryTax = tax === null || relief === null || surcharge === null ? null : input.declared ? tax - relief : tax + surcharge;
    const total = spend === null || entryTax === null ? null : spend + entryTax;
    if ([gross, localTax, localTaxRate, refund, fee, spend, allowance, taxable, tax, relief, surcharge, entryTax, total].some(value => value !== null && !Number.isFinite(value)))
        return null;
    return { rate, gross, localTax, localTaxRate, localTaxLabel, localTaxEstimated, discount: round(discount * rate), coupon: round(coupon * rate), storeDiscount: round(storeDiscount * rate), refund, refundMaximum, refundRate, refundLabel, fee, feeRate, cardBase, spend, allowance, taxable, tax, relief, surcharge, entryTax, total, japanReformed, explicitFinal };
}

},
"app/src/lib/comparison-cache.ts":(module,exports,require)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComparisonCache = exports.CACHE_LIMIT = exports.CALCULATION_VERSION = void 0;
exports.calculationKey = calculationKey;
const comparison_1 = require("./comparison");
// Bump whenever calculation semantics change, including rounding and defaults.
exports.CALCULATION_VERSION = '2026-10-13-v6';
exports.CACHE_LIMIT = 96;
const MAX_BYTES = 256 * 1024;
const MAX_AGE = 7 * 86400 * 1000;
function canonical(value) {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object')
        return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
    return JSON.stringify(value) ?? 'null';
}
function calculationKey(price, country, currency, context, input, kind = 'bag') {
    const date = (0, comparison_1.comparisonDate)(context, input);
    return canonical({ version: exports.CALCULATION_VERSION, price, country, currency, kind, input: { ...input, purchaseDate: date }, context: context ? { rates: context.rates, rateUpdatedAt: context.rateUpdatedAt, rules: context.rules } : null });
}
const numericFields = ['rate', 'gross', 'localTax', 'localTaxRate', 'discount', 'coupon', 'storeDiscount', 'refund', 'refundMaximum', 'refundRate', 'fee', 'feeRate', 'cardBase', 'spend', 'allowance', 'taxable', 'tax', 'relief', 'surcharge', 'entryTax', 'total'];
const nullableFields = new Set(['refundMaximum', 'feeRate', 'allowance', 'taxable', 'tax', 'relief', 'surcharge', 'entryTax', 'total']);
function validResult(value) {
    if (!value || typeof value !== 'object')
        return false;
    const item = value;
    return numericFields.every(field => item[field] === null && nullableFields.has(field) || typeof item[field] === 'number' && Number.isFinite(item[field]) && item[field] >= 0)
        && typeof item.refundLabel === 'string' && typeof item.localTaxLabel === 'string' && typeof item.localTaxEstimated === 'boolean' && typeof item.japanReformed === 'boolean' && typeof item.explicitFinal === 'boolean';
}
class ComparisonCache {
    calculate;
    entries = new Map();
    constructor(calculate = comparison_1.calculateComparison) {
        this.calculate = calculate;
    }
    get(...args) {
        const key = calculationKey(...args);
        return this.lookup(key, args);
    }
    // One immutable calculation snapshot per catalog job, not a full rules
    // serialization for every country of every product. Keys remain identical.
    prepare(context, input, kind = 'bag') {
        const snapshot = JSON.parse(JSON.stringify({ context, input }));
        const fixedContext = canonical({ rates: snapshot.context.rates, rateUpdatedAt: snapshot.context.rateUpdatedAt, rules: snapshot.context.rules });
        const fixedInput = canonical({ ...snapshot.input, purchaseDate: (0, comparison_1.comparisonDate)(snapshot.context, snapshot.input) });
        return (price, country, currency) => {
            const key = `{"context":${fixedContext},"country":${canonical(country)},"currency":${canonical(currency)},"input":${fixedInput},"kind":${canonical(kind)},"price":${canonical(price)},"version":${canonical(exports.CALCULATION_VERSION)}}`;
            return this.lookup(key, [price, country, currency, snapshot.context, snapshot.input, kind]);
        };
    }
    lookup(key, args) {
        const hit = this.entries.get(key);
        if (hit && Date.now() - hit.savedAt <= MAX_AGE) {
            this.entries.delete(key);
            this.entries.set(key, hit);
            return hit.result;
        }
        this.entries.delete(key);
        const result = this.calculate(...args);
        if (result) {
            this.entries.set(key, { key, result, savedAt: Date.now() });
            while (this.entries.size > exports.CACHE_LIMIT)
                this.entries.delete(this.entries.keys().next().value);
        }
        return result;
    }
    restore(serialized) {
        if (!serialized || serialized.length * 3 > MAX_BYTES)
            return;
        try {
            const data = JSON.parse(serialized);
            if (data.version !== exports.CALCULATION_VERSION || !Array.isArray(data.entries) || data.entries.length > exports.CACHE_LIMIT)
                return;
            for (const entry of data.entries) {
                if (typeof entry.key !== 'string' || entry.key.length > 16384 || !entry.key.includes(exports.CALCULATION_VERSION)
                    || !Number.isFinite(entry.savedAt) || entry.savedAt > Date.now() || Date.now() - entry.savedAt > MAX_AGE || !validResult(entry.result))
                    continue;
                if (!this.entries.has(entry.key))
                    this.entries.set(entry.key, entry);
            }
            while (this.entries.size > exports.CACHE_LIMIT)
                this.entries.delete(this.entries.keys().next().value);
        }
        catch { /* A broken cache is discarded, never a calculation failure. */ }
    }
    serialize() {
        const entries = [...this.entries.values()];
        let serialized = JSON.stringify({ version: exports.CALCULATION_VERSION, entries });
        // At most three UTF-8 bytes per JS code unit, including Korean labels.
        while (serialized.length * 3 > MAX_BYTES && entries.length) {
            entries.shift();
            serialized = JSON.stringify({ version: exports.CALCULATION_VERSION, entries });
        }
        return serialized;
    }
}
exports.ComparisonCache = ComparisonCache;

},
"app/src/lib/catalog-snapshot.ts":(module,exports,require)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validCatalogSnapshot = validCatalogSnapshot;
exports.snapshotEstimates = snapshotEstimates;
function validCatalogSnapshot(value) {
    const s = value;
    if (!s || s.schema !== 1 || !Number.isSafeInteger(s.revision) || s.revision < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(s.day) || !s.calculationVersion || !s.ruleVersion || !Number.isFinite(Date.parse(s.calculatedAt)) || !Number.isFinite(Date.parse(s.fxUpdatedAt)) || !Number.isSafeInteger(s.products) || s.products < 1 || !Array.isArray(s.estimates) || s.estimates.length !== s.products)
        return false;
    const ids = new Set();
    return s.estimates.every(row => {
        if (!row || !/^[0-9a-f-]{36}$/i.test(row.id) || ids.has(row.id))
            return false;
        ids.add(row.id);
        if (row.total === null)
            return row.country === null && row.saving === null && row.savingRate === null;
        return typeof row.country === 'string' && /^[A-Z]{2}$/.test(row.country) && row.country !== 'KR' && typeof row.total === 'number' && Number.isFinite(row.total) && row.total >= 0 && (row.saving === null || typeof row.saving === 'number' && Number.isFinite(row.saving)) && (row.savingRate === null || typeof row.savingRate === 'number' && Number.isFinite(row.savingRate));
    });
}
function snapshotEstimates(s) { const result = new Map(); for (const row of s.estimates)
    if (row.country && row.total !== null)
        result.set(row.id, { country: row.country, total: row.total, saving: row.saving, savingRate: row.savingRate }); return result; }

},
"app/src/lib/product-kind.ts":(module,exports,require)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productKind = productKind;
// Only registered Korean reference categories; no name-based product guessing.
function productKind(product) {
    if (product?.kind)
        return product.kind;
    if (product?.brandSlug === 'van-cleef-arpels' || product?.brandSlug === 'bulgari')
        return 'jewelry';
    if (product?.brandSlug === 'rolex')
        return 'watch';
    const names = [product?.brand, product?.brandOriginal].map(v => (v ?? '').normalize('NFKC').replace(/\s/g, '').toLowerCase());
    if (names.some(v => v === '롤렉스' || v === 'rolex'))
        return 'watch';
    if (names.some(v => v === '반클리프아펠' || v === 'vancleef&arpels' || v === '불가리' || v === 'bulgari' || v === 'bvlgari'))
        return 'jewelry';
    return 'bag';
}

}
},cache={};
const path=require("node:path").posix;function load(id){if(cache[id])return cache[id].exports;if(id==="app/src/data/comparison-defaults.json")return {"version":"2026-10-12-estimates-v3","verifiedAt":"2026-10-12","tax":{"allowanceUsd":800,"bagThreshold":1923000,"jewelryThreshold":4808000,"lowRate":0.15,"highRate":0.45,"declarationDiscount":0.3,"declarationDiscountCap":200000,"firstSurcharge":0.4},"card":{"defaultRate":0.013,"range":[0.012,0.017]},"salesTax":{"US":{"generalRate":0.08875,"referenceLocation":"뉴욕시","basis":"대표 구매지역 세율을 적용한 앱 기본 예상치 · 미국 전국 공통 세율 아님"}},"refund":{"KR":{"generalRate":0,"reason":"한국 거주자의 국내 구매는 관광객 환급 대상 아님"},"US":{"generalRate":0,"reason":"일반 관광객 환급 없음 · 일부 지역·판매처 예외"},"HK":{"generalRate":0,"reason":"VAT·판매세 없음"},"FR":{"minimumGross":100.01,"generalRate":0.12},"JP":{"vatRate":0.1,"counterFeeNetRate":0.0155,"reformEstimatedFeeNetRate":0.0155,"minimumNet":5000,"reformDate":"2026-11-01","reformEstimateBasis":"개편 후 처리 수수료의 확정값이 아닌 앱 추정치 · 기존 카운터 수준을 참고"},"IT":{"minimumGross":70.01,"generalRate":0.13,"referenceMaximumRate":0.135},"ES":{"smallMaximum":100,"smallRate":0.105,"fixedUpperBounds":[125,150,175,200,225,250,275,300,325,350,375,400,425,450,475,500,525,550,575,600,625,650,675,700,725,750,775,800,825,850,875,900,925,950,975,1000],"fixedAmounts":[13,16.5,19.5,22,25,28.5,31.5,34.5,38,41,44,48,51,53.5,56.5,60,65.5,69,73,75.5,78.5,82.5,85.5,89.5,92,95.5,99,102,105.5,109.5,113.5,116,119.5,122,126,128.5],"rateUpperBounds":[1500,2000,3000,4000,5000],"rates":[0.137,0.1405,0.145,0.149,0.153],"topRate":0.157},"SG":{"minimumGross":100,"vatRate":0.09,"generalRate":0.07,"estimateBasis":"처리 수수료를 감안한 앱 기본 예상 환급률 · 법정·보장 환급률 아님"}},"sources":[{"title":"관세청 간이세율표","url":"https://www.customs.go.kr/incheon_airport/cm/cntnts/cntntsView.do?cntntsId=6920&mi=12714"},{"title":"관세청 면세한도 · 신고 기준","url":"https://www.customs.go.kr/kcs/cm/cntnts/cntntsView.do?cntntsId=829&mi=2837"},{"title":"프랑스 일반 환급 예상치 근거","url":"https://haussmann.galerieslafayette.com/en/tax-refunds/"},{"title":"이탈리아 환급 예상치 참고 · 최대 13.5%","url":"https://www.scalomilano.it/en/our-services/"},{"title":"스페인 주요 판매처 환급 예상치","url":"https://www.elcorteingles.com/luxe/tax-free-shopping"},{"title":"싱가포르 관광객 환급 · 처리 수수료","url":"https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/consumers/tourist-refund-scheme"},{"title":"미국 일반 관광객 판매세 환급 없음","url":"https://www.help.cbp.gov/s/article/Article-1410?language=en_US"},{"title":"미국 뉴욕시 판매세 · 기본 예상 기준","url":"https://www.nyc.gov/site/finance/business/business-nys-sales-tax.page"},{"title":"홍콩 VAT·판매세 없음","url":"https://www.hkengage.gov.hk/en/business"},{"title":"이탈리아 관세청 환급 조건","url":"https://www.adm.gov.it/portale/-/the-procedure"},{"title":"스페인 국세청 여행자 VAT 환급","url":"https://sede.agenciatributaria.gob.es/Sede/en_gb/viajeros-trabajadores-desplazados-fronterizos/devoluciones-iva-compras-viajeros.html"},{"title":"Rates By Exchange Rate API","url":"https://www.exchangerate-api.com"},{"title":"일본 소비세","url":"https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6303.htm"},{"title":"일본 면세 카운터 수수료","url":"https://www.daimaru.co.jp/shinsaibashi-store/e/service/"},{"title":"일본 2026년 11월 환급 개편","url":"https://www.nta.go.jp/publication/pamph/shohi/menzei/201805/format/002.htm"},{"title":"카드 해외결제 수수료","url":"https://mobileapps.kbcard.com/SVC/DVIEW/MSDMCXHIASVCD0025?selectedTap=1"}]};const module={exports:{}};cache[id]=module;if(!factories[id])throw Error("CALCULATION_MODULE_SCOPE");factories[id](module,module.exports,n=>{let next=path.normalize(path.join(path.dirname(id),n));if(!next.endsWith(".json"))next+=".ts";return load(next);});return module.exports;}
module.exports={...load("cloudflare/catalog-comparison.ts"),...load("app/src/lib/catalog-snapshot.ts")};
