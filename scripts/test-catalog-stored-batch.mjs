import assert from 'node:assert/strict';
import {verifiedStoredCatalogBatch} from '../crawler/common/catalog-workflow.js';
const ready=code=>({status:'REFERENCE_IMAGE_PRICE_READY',variantCode:code}),proof=code=>({status:'PUBLIC_CATALOG_VERIFIED',variantCode:code});
assert(verifiedStoredCatalogBatch([ready('M12345'),ready('M12346')],[proof('M12346'),proof('M12345')]));
for(const receipts of [[],[proof('M12345')],[proof('M12345'),proof('M12345')],[proof('M12345'),proof('M12347')]])assert(!verifiedStoredCatalogBatch([ready('M12345'),ready('M12346')],receipts));
assert(!verifiedStoredCatalogBatch([],[]));
assert(!verifiedStoredCatalogBatch([ready('M12345'),ready('M12345')],[proof('M12345'),proof('M12345')]));
console.log('PASS: partial catalogue exit accepts only complete unique exact public batch receipts');
