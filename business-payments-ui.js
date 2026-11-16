// NAVA BUSINESS — customer account balances and receipt entry.
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const form = $("bizPaymentForm");
  if (!form) return;

  const API = "https://nava-music-api.honrrpower.workers.dev/businesses";
  const numberFormat = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
  const digits = value => String(value ?? "")
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٬,،\s]/g, "");
  const money = value => numberFormat.format(Number(value || 0)) + " تومان";
  const businessId = () => $("bizProfileSelect")?.value || localStorage.getItem("nava_business_active_id") || "";
  const token = () => {
    try {
      return Number(localStorage.getItem("nava_navi_expiry") || 0) > Date.now()
        ? localStorage.getItem("nava_navi_session") || "" : "";
    } catch { return ""; }
  };
  const say = (message, bad = false) => {
    const node = $("bizPaymentStatus");
    if (node) { node.textContent = message; node.dataset.state = bad ? "error" : "success"; }
  };
  const persianParts = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC"
  });
  const persianDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC"
  });
  function parts(date) {
    const result = {};
    for (const part of persianParts.formatToParts(date)) {
      if (part.type !== "literal") result[part.type] = Number(part.value);
    }
    return result;
  }
  function toPersian(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return persianDate.format(new Date(Date.UTC(year, month - 1, day)));
  }
  function toIso(value) {
    const values = digits(value).replace(/[.-]/g, "/").split("/").map(Number);
    if (values.length !== 3 || values.some(n => !Number.isInteger(n))) {
      throw Error("تاریخ را به شکل سال/ماه/روز شمسی وارد کن.");
    }
    const [jy, jm, jd] = values;
    if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31) {
      throw Error("تاریخ شمسی معتبر نیست.");
    }
    const start = Date.UTC(jy + 621, 0, 1);
    for (let time = start; time < start + 400 * 86400000; time += 86400000) {
      const date = new Date(time);
      const p = parts(date);
      if (p.year === jy && p.month === jm && p.day === jd) {
        return date.getUTCFullYear() + "-" +
          String(date.getUTCMonth() + 1).padStart(2, "0") + "-" +
          String(date.getUTCDate()).padStart(2, "0");
      }
    }
    throw Error("این تاریخ شمسی در تقویم معتبر نیست.");
  }
  async function api(path, method = "GET", body) {
    const auth = token();
    if (!auth) throw Error("برای مدیریت حساب مشتریان ابتدا وارد حساب نوا شو.");
    const response = await fetch(API + "/" + encodeURIComponent(businessId()) + path, {
      method,
      headers: { Authorization: "Bearer " + auth, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw Error(data.error || "درخواست انجام نشد.");
    return data;
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function renderSummary(totals) {
    const root = $("bizAccountSummary");
    root.replaceChildren();
    [
      ["فروش متصل به مشتری", totals.salesToman],
      ["وجه دریافت‌شده", totals.receivedToman],
      ["مانده کل حساب‌ها", totals.balanceToman]
    ].forEach(([label, value]) => {
      const card = el("article", "biz-account-stat");
      card.append(el("small", "", label), el("strong", "", money(value)));
      root.append(card);
    });
  }
  function renderAccounts(accounts) {
    const body = $("bizAccountRows");
    body.replaceChildren();
    const active = accounts.filter(account => account.status === "active");
    if (!active.length) {
      const row = el("tr", "");
      const cell = el("td", "biz-account-empty", "هنوز مشتری فعالی در این پرونده ثبت نشده است.");
      cell.colSpan = 4;
      row.append(cell);
      body.append(row);
      return;
    }
    active.forEach(account => {
      const row = el("tr", "");
      const balance = el("td", account.balanceToman > 0 ? "is-debt" : account.balanceToman < 0 ? "is-credit" : "");
      balance.textContent = account.balanceToman > 0
        ? "بدهکار: " + money(account.balanceToman)
        : account.balanceToman < 0 ? "بستانکار: " + money(Math.abs(account.balanceToman)) : "تسویه";
      row.append(
        el("td", "", account.customerName + (account.phone ? " · " + account.phone : "")),
        el("td", "", money(account.salesToman)),
        el("td", "", money(account.receivedToman)),
        balance
      );
      body.append(row);
    });
  }
  function renderPayments(payments) {
    const root = $("bizPaymentHistory");
    root.replaceChildren();
    if (!payments.length) {
      root.append(el("p", "biz-crm-empty", "هنوز دریافتی ثبت نشده است."));
      return;
    }
    const methods = { cash: "نقدی", card: "کارت‌خوان", bank_transfer: "انتقال بانکی", other: "سایر" };
    payments.forEach(payment => {
      const card = el("article", "biz-payment-row");
      const main = el("div", "biz-payment-main");
      main.append(
        el("strong", "", payment.customerName),
        el("small", "", toPersian(payment.paymentDate) + " · " +
          (methods[payment.paymentMethod] || "سایر") +
          (payment.reference ? " · پیگیری: " + payment.reference : ""))
      );
      if (payment.notes) main.append(el("p", "", payment.notes));
      card.append(main, el("strong", payment.status === "received" ? "" : "is-voided",
        money(payment.amountToman) + (payment.status === "voided" ? " · باطل‌شده" : "")));
      if (payment.status === "received") {
        const cancel = el("button", "biz-payment-void", "ابطال دریافت");
        cancel.type = "button";
        cancel.addEventListener("click", async () => {
          if (!await window.navaConfirm("این دریافت وجه باطل شود؟ مانده حساب مشتری دوباره محاسبه خواهد شد.", {
            title: "ابطال دریافت وجه", confirmText: "ابطال دریافت", danger: true
          })) return;
          cancel.disabled = true;
          try {
            await api("/payments/" + encodeURIComponent(payment.id) + "/void", "POST", {});
            await load();
            say("دریافت وجه باطل شد و مانده حساب به‌روز شد.");
          } catch (error) { say(error.message, true); cancel.disabled = false; }
        });
        card.append(cancel);
      }
      root.append(card);
    });
  }
  async function load() {
    if (!businessId()) { say("ابتدا یک پرونده کسب‌وکار انتخاب کن.", true); return; }
    try {
      const [accountData, paymentData, customerData] = await Promise.all([
        api("/accounts"), api("/payments"), api("/customers?status=active")
      ]);
      renderSummary(accountData.totals || {});
      renderAccounts(accountData.accounts || []);
      renderPayments(paymentData.payments || []);
      const select = $("bizPaymentCustomer");
      const selected = select.value;
      select.replaceChildren(el("option", "", "انتخاب مشتری"));
      select.firstChild.value = "";
      (customerData.customers || []).forEach(customer => {
        const option = el("option", "", customer.name);
        option.value = customer.id;
        select.append(option);
      });
      if ([...select.options].some(option => option.value === selected)) select.value = selected;
      say("حساب مشتریان و سوابق دریافت وجه به‌روز شد.");
    } catch (error) { say(error.message, true); }
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const amount = Number(digits($("bizPaymentAmount").value));
    if (!$("bizPaymentCustomer").value) { say("مشتری را انتخاب کن.", true); return; }
    if (!Number.isSafeInteger(amount) || amount < 1) { say("مبلغ دریافتی باید عدد صحیح مثبت باشد.", true); return; }
    let paymentDate;
    try { paymentDate = toIso($("bizPaymentDate").value); }
    catch (error) { say(error.message, true); return; }
    const button = $("bizPaymentSubmit");
    button.disabled = true;
    try {
      await api("/payments", "POST", {
        customerId: $("bizPaymentCustomer").value,
        amountToman: amount,
        paymentDate,
        paymentMethod: $("bizPaymentMethod").value,
        reference: $("bizPaymentReference").value.trim(),
        notes: $("bizPaymentNotes").value.trim()
      });
      form.reset();
      $("bizPaymentDate").value = toPersian(
        new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
      );
      await load();
      say("دریافت وجه ثبت شد؛ مانده حساب مشتری به‌روزرسانی شد.");
    } catch (error) { say(error.message, true); }
    finally { button.disabled = false; }
  });
  $("bizPaymentAmount").addEventListener("input", event => {
    const value = digits(event.target.value);
    if (event.target.value !== value) event.target.value = value;
  });
  const refresh = () => load();
  $("bizProfileSelect")?.addEventListener("change", refresh);
  window.addEventListener("nava:business-selection-changed", refresh);
  window.addEventListener("nava:business-auth-changed", refresh);
  window.addEventListener("focus", refresh);
  $("bizPaymentDate").value = toPersian(
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  );
  load();
})();
