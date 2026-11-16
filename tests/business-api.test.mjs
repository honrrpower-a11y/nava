import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

async function loadBusinessApi() {
  let source = await readFile(new URL("../modules/business.js", import.meta.url), "utf8");
  source = source
    .replace(/^import\s+.*?;\s*$/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function)/g, "");
  source += "\nglobalThis.__businessApi = { normalizeBusinessProfileInput, normalizeBusinessRecordInput, buildBusinessAdvisorContext };";
  const sandbox = {
    console,
    JSON,
    Object,
    String,
    Set,
    safeNaviText(value, maxLength = 3000) {
      return String(value ?? "").replace(/\\u0000/g, "").replace(/[\\u0001-\\u0008\\u000B\\u000C\\u000E-\\u001F]/g, "").trim().slice(0, maxLength);
    }
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.__businessApi;
}

test("business profile accepts supported types and normalizes optional fields", async () => {
  const api = await loadBusinessApi();
  const result = api.normalizeBusinessProfileInput({
    name: "فروشگاه آزمایشی",
    businessType: "store",
    industry: "مواد غذایی",
    description: "فروش محصولات محلی",
    currency: "toman"
  });
  assert.equal(result.value.name, "فروشگاه آزمایشی");
  assert.equal(result.value.business_type, "store");
  assert.equal(result.value.currency, "TOMAN");
});

test("business profile rejects short names and unsupported types", async () => {
  const api = await loadBusinessApi();
  assert.match(api.normalizeBusinessProfileInput({ name: "X" }).error, /حداقل ۲/);
  assert.match(api.normalizeBusinessProfileInput({ name: "فروشگاه", businessType: "admin" }).error, /نوع کسب‌وکار/);
});

test("business profile patch requires at least one valid field but not a name", async () => {
  const api = await loadBusinessApi();
  const patch = api.normalizeBusinessProfileInput({ industry: "خدمات" }, true);
  assert.equal(patch.value.industry, "خدمات");
  assert.equal(patch.value.name, undefined);
  assert.match(api.normalizeBusinessProfileInput({}, true).error, /هیچ فیلد/);
});

test("financial records accept only known report types and object payloads", async () => {
  const api = await loadBusinessApi();
  const result = api.normalizeBusinessRecordInput({
    recordType: "monthly_budget",
    title: "بودجه آبان",
    periodKey: "2026-11",
    reportText: "مجموع هزینه‌ها: ۷ میلیون تومان",
    payload: { expenses: 7000000 }
  });
  assert.equal(result.value.record_type, "monthly_budget");
  assert.equal(result.value.period_key, "2026-11");
  assert.equal(JSON.parse(result.value.payload_json).expenses, 7000000);
  assert.match(api.normalizeBusinessRecordInput({
    recordType: "passwords", title: "گزارش", reportText: "متن"
  }).error, /نوع گزارش/);
  assert.match(api.normalizeBusinessRecordInput({
    recordType: "note", title: "گزارش", reportText: "متن", payload: []
  }).error, /شیء معتبر/);
});

test("financial records reject malformed periods, empty reports and oversized payloads", async () => {
  const api = await loadBusinessApi();
  assert.match(api.normalizeBusinessRecordInput({
    recordType: "note", title: "گزارش", periodKey: "2026-13", reportText: "متن"
  }).error, /سال-ماه/);
  assert.match(api.normalizeBusinessRecordInput({
    recordType: "note", title: "گزارش", reportText: " "
  }).error, /خالی/);
  assert.match(api.normalizeBusinessRecordInput({
    recordType: "note", title: "گزارش", reportText: "متن", payload: { text: "x".repeat(21000) }
  }).error, /بیش از حد بزرگ/);
});


test("business advisor context contains only bounded profile and financial report fields", async () => {
  const api = await loadBusinessApi();
  const context = api.buildBusinessAdvisorContext(
    { name: "فروشگاه", business_type: "store", industry: "مواد غذایی", description: "فروش محلی", currency: "TOMAN" },
    [{
      record_type: "cost_calculation",
      title: "قیمت تمام‌شده",
      period_key: "2026-11",
      report_text: "هزینه هر واحد: ۶۰۰۰ تومان",
      payload_json: '{"unitCost":6000}',
      created_at: "2026-11-15"
    }]
  );
  assert.match(context, /پرونده کسب‌وکار: فروشگاه/);
  assert.match(context, /هزینه هر واحد\s*۶۰۰۰ تومان/);
  assert.match(context, /داده‌های ساختاریافته/);
  assert.doesNotMatch(context, /owner_id|password_hash|auth_subject/);
});

test("business advisor context remains bounded when report text is oversized", async () => {
  const api = await loadBusinessApi();
  const context = api.buildBusinessAdvisorContext(
    { name: "فروشگاه", business_type: "store" },
    Array.from({ length: 8 }, (_, index) => ({
      record_type: "note", title: "گزارش " + index, report_text: "x".repeat(12000),
      payload_json: "{}", created_at: "2026-11-15"
    }))
  );
  assert.ok(context.length <= 20000);
});


async function loadBusinessTransactionApi() {
  let source = await readFile(new URL("../modules/business-transactions.js", import.meta.url), "utf8");
  source = source
    .replace(/^import\s+.*?;\s*$/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function)/g, "");
  source += "\nglobalThis.__transactionApi = { normalizeBusinessTransactionInput };";
  const sandbox = {
    console, JSON, Object, String, Number, Date, Set,
    safeNaviText(value, maxLength = 3000) {
      return String(value ?? "").replace(/\u0000/g, "").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, maxLength);
    }
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.__transactionApi;
}

test("business transaction accepts a linked catalogue item and rejects malformed IDs", async () => {
  const api = await loadBusinessTransactionApi();
  const itemId = "item-12345678-1234-1234-1234-123456789012";
  const linked = api.normalizeBusinessTransactionInput({
    transactionType: "sale", title: "بسته قهوه", amountToman: 60000,
    transactionDate: "2026-11-16", catalogItemId: itemId, quantity: 2, unitPriceToman: 30000
  });
  assert.equal(linked.value.catalog_item_id, itemId);
  const customerId = "customer-12345678-1234-1234-1234-123456789012";
  const customerSale = api.normalizeBusinessTransactionInput({
    transactionType: "sale", title: "فروش به مشتری", amountToman: 1000,
    transactionDate: "2026-11-16", customerId
  });
  assert.equal(customerSale.value.customer_id, customerId);
  assert.match(api.normalizeBusinessTransactionInput({
    transactionType: "expense", title: "هزینه", amountToman: 1000,
    transactionDate: "2026-11-16", customerId
  }).error, /فقط برای فروش/);
  assert.match(api.normalizeBusinessTransactionInput({
    transactionType: "sale", title: "فروش", amountToman: 100,
    transactionDate: "2026-11-16", catalogItemId: "not-an-item"
  }).error, /شناسه محصول/);
  assert.match(api.normalizeBusinessTransactionInput({
    transactionType: "expense", title: "هزینه", amountToman: 100,
    transactionDate: "2026-11-16", catalogItemId: itemId
  }).error, /برای ثبت هزینه/);
});

test("business transactions accept Toman sales and expenses with valid dates", async () => {
  const api = await loadBusinessTransactionApi();
  const sale = api.normalizeBusinessTransactionInput({
    transactionType: "sale", title: "فروش محصول", amountToman: 200000,
    transactionDate: "2026-11-15", category: "فروش", quantity: 10, unitPriceToman: 20000
  });
  assert.equal(sale.value.transaction_type, "sale");
  assert.equal(sale.value.amount_toman, 200000);
  assert.equal(sale.value.quantity, 10);
  const expense = api.normalizeBusinessTransactionInput({
    transactionType: "expense", title: "خرید مواد اولیه", amountToman: 85000,
    transactionDate: "2026-11-15", category: "مواد اولیه"
  });
  assert.equal(expense.value.transaction_type, "expense");
  assert.equal(expense.value.amount_toman, 85000);
});

test("business transactions reject invalid amounts, dates and inconsistent sales", async () => {
  const api = await loadBusinessTransactionApi();
  const base = { transactionType: "sale", title: "فروش محصول", amountToman: 200000, transactionDate: "2026-11-15" };
  assert.match(api.normalizeBusinessTransactionInput({ ...base, amountToman: 200000.5 }).error, /عدد صحیح/);
  assert.match(api.normalizeBusinessTransactionInput({ ...base, transactionDate: "2026-02-30" }).error, /تاریخ/);
  assert.match(api.normalizeBusinessTransactionInput({ ...base, quantity: 3, unitPriceToman: 50000 }).error, /برابر/);
  assert.match(api.normalizeBusinessTransactionInput({ ...base, transactionType: "expense", quantity: 2 }).error, /هزینه/);
});

test("business transaction partial updates accept only supplied valid fields", async () => {
  const api = await loadBusinessTransactionApi();
  const result = api.normalizeBusinessTransactionInput({ title: "اصلاح عنوان", amountToman: 125000 }, true);
  assert.equal(result.value.title, "اصلاح عنوان");
  assert.equal(result.value.amount_toman, 125000);
  assert.equal(result.value.transaction_date, undefined);
});


async function loadCustomerPaymentApi() {
  let source = await readFile(new URL("../modules/business-payments.js", import.meta.url), "utf8");
  source = source
    .replace(/^import\s+.*?;\s*$/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function)/g, "");
  source += "\nglobalThis.__customerPaymentApi = { normalizeCustomerPaymentInput };";
  const sandbox = {
    console, JSON, Object, String, Number, Date, Set, RegExp,
    safeNaviText(value, maxLength = 3000) {
      return String(value ?? "").replace(/\u0000/g, "").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, maxLength);
    }
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.__customerPaymentApi;
}

test("customer receipts validate customer, amount, date and payment method", async () => {
  const api = await loadCustomerPaymentApi();
  const customerId = "customer-12345678-1234-1234-1234-123456789012";
  const result = api.normalizeCustomerPaymentInput({
    customerId, amountToman: 250000, paymentDate: "2026-11-16",
    paymentMethod: "bank_transfer", reference: "TRACK-1", notes: "پرداخت بخشی"
  });
  assert.equal(result.value.customer_id, customerId);
  assert.equal(result.value.amount_toman, 250000);
  assert.equal(result.value.payment_method, "bank_transfer");
  const cashAccountId = "cash-12345678-1234-1234-1234-123456789012";
  const linkedReceipt = api.normalizeCustomerPaymentInput({
    customerId, cashAccountId, amountToman: 250000, paymentDate: "2026-11-16", paymentMethod: "cash"
  });
  assert.equal(linkedReceipt.value.cash_account_id, cashAccountId);
  assert.match(api.normalizeCustomerPaymentInput({
    customerId, cashAccountId: "bad-id", amountToman: 100, paymentDate: "2026-11-16", paymentMethod: "cash"
  }).error, /شناسه حساب مالی/);
  assert.match(api.normalizeCustomerPaymentInput({
    customerId, amountToman: 0, paymentDate: "2026-11-16", paymentMethod: "cash"
  }).error, /مبلغ/);
  assert.match(api.normalizeCustomerPaymentInput({
    customerId, amountToman: 100, paymentDate: "2026-02-30", paymentMethod: "cash"
  }).error, /تاریخ/);
  assert.match(api.normalizeCustomerPaymentInput({
    customerId, amountToman: 100, paymentDate: "2026-11-16", paymentMethod: "crypto"
  }).error, /روش دریافت/);
  assert.match(api.normalizeCustomerPaymentInput({
    customerId: "bad-id", amountToman: 100, paymentDate: "2026-11-16", paymentMethod: "cash"
  }).error, /مشتری/);
});
