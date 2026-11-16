import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

async function loadInvoiceApi() {
  let source = await readFile(new URL("../modules/business-invoices.js", import.meta.url), "utf8");
  source = source.replace(/^import\s+.*?;\s*$/gm, "").replace(/\bexport\s+(?=(?:async\s+)?function)/g, "");
  source += "\nglobalThis.__invoiceApi = { normalizeInvoiceAdjustments };";
  const sandbox = {
    console, JSON, Object, String, Number, Date, Set,
    safeNaviText(value, maxLength = 3000) {
      return String(value ?? "").replace(/\u0000/g, "").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, maxLength);
    }
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.__invoiceApi;
}

test("invoice computes subtotal, discount, tax and shipping in integer tomans", async () => {
  const api = await loadInvoiceApi();
  const result = api.normalizeInvoiceAdjustments({
    discountToman: 5000, taxToman: 9000, shippingToman: 12000
  }, 100000);
  assert.deepEqual(JSON.parse(JSON.stringify(result.value)), {
    discount_toman: 5000, tax_toman: 9000, shipping_toman: 12000, total_toman: 116000
  });
});

test("invoice defaults optional adjustments to zero", async () => {
  const api = await loadInvoiceApi();
  const result = api.normalizeInvoiceAdjustments({}, 250000);
  assert.equal(result.value.total_toman, 250000);
  assert.equal(result.value.discount_toman, 0);
});

test("invoice rejects discount above subtotal and invalid adjustment values", async () => {
  const api = await loadInvoiceApi();
  assert.match(api.normalizeInvoiceAdjustments({ discountToman: 100001 }, 100000).error, /تخفیف/);
  assert.match(api.normalizeInvoiceAdjustments({ taxToman: -1 }, 100000).error, /مالیات/);
  assert.match(api.normalizeInvoiceAdjustments({ shippingToman: 1.5 }, 100000).error, /هزینه حمل/);
});

test("invoice rejects totals above the supported maximum", async () => {
  const api = await loadInvoiceApi();
  assert.match(api.normalizeInvoiceAdjustments({ taxToman: 1 }, 1000000000000).error, /مبلغ نهایی/);
});
