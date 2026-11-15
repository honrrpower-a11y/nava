/* NAVA BUSINESS — Toman sales and expense ledger UI */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const form = $("bizTransactionForm");
  if (!form) return;
  const list = $("bizTransactionList");
  const summary = $("bizTransactionSummary");
  const status = $("bizTransactionStatus");
  const submit = $("bizTransactionSubmit");
  const dateInput = $("bizTransactionDate");
  const API = "https://nava-music-api.honrrpower.workers.dev/businesses";
  const token = () => {
    try {
      const expiry = Number(localStorage.getItem("nava_navi_expiry") || 0);
      const value = localStorage.getItem("nava_navi_session") || "";
      return expiry > Date.now() ? value : "";
    } catch { return ""; }
  };
  const businessId = () => $("bizProfileSelect")?.value || "";
  const money = value => Number(value || 0).toLocaleString("fa-IR") + " تومان";
  const say = message => { if (status) status.textContent = message; };

  async function api(path, method = "GET", body) {
    const auth = token();
    if (!auth) throw new Error("برای ثبت تراکنش ابتدا وارد حساب نوا شو.");
    const response = await fetch(API + path, {
      method,
      headers: {
        "Authorization": "Bearer " + auth,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || "عملیات تراکنش انجام نشد.");
    return data;
  }

  function localToday() {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  async function load() {
    const id = businessId();
    if (!id) {
      if (list) list.textContent = "برای نمایش تراکنش‌ها یک پرونده فعال انتخاب کن.";
      if (summary) summary.textContent = "";
      return;
    }
    const data = await api("/" + encodeURIComponent(id) + "/transactions?limit=100");
    const rows = data.transactions || [];
    const sales = rows.filter(x => x.transactionType === "sale").reduce((a, x) => a + Number(x.amountToman || 0), 0);
    const expenses = rows.filter(x => x.transactionType === "expense").reduce((a, x) => a + Number(x.amountToman || 0), 0);
    summary.textContent = "۱۰۰ تراکنش اخیر — فروش: " + money(sales) + " | هزینه: " + money(expenses) + " | تفاضل فروش و هزینه ثبت‌شده: " + money(sales - expenses);
    list.replaceChildren();
    if (!rows.length) {
      list.textContent = "هنوز تراکنش واقعی در این پرونده ثبت نشده است.";
      return;
    }
    const container = document.createElement("div");
    container.className = "biz-transaction-items";
    for (const row of rows) {
      const card = document.createElement("article");
      card.className = "biz-transaction-item";
      const heading = document.createElement("strong");
      heading.textContent = row.title;
      const meta = document.createElement("small");
      meta.textContent = (row.transactionType === "sale" ? "فروش ثبت‌شده" : "هزینه ثبت‌شده") + " | " + row.transactionDate + (row.category ? " | " + row.category : "");
      const amount = document.createElement("b");
      amount.dataset.type = row.transactionType;
      amount.textContent = (row.transactionType === "sale" ? "+" : "−") + money(row.amountToman);
      const notes = document.createElement("p");
      notes.textContent = row.notes || "";
      const main = document.createElement("div");
      main.className = "biz-transaction-main";
      main.append(heading, meta, amount);
      if (row.notes) main.append(notes);
      const actions = document.createElement("div");
      actions.className = "biz-transaction-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "ویرایش";
      edit.addEventListener("click", async () => {
        const title = window.prompt("عنوان تراکنش:", row.title);
        if (title === null) return;
        const amountText = window.prompt("مبلغ به تومان:", String(row.amountToman));
        if (amountText === null) return;
        const amountValue = Number(amountText);
        if (title.trim().length < 2 || !Number.isSafeInteger(amountValue) || amountValue <= 0) {
          say("عنوان یا مبلغ معتبر نیست.");
          return;
        }
        edit.disabled = true;
        try {
          await api("/" + encodeURIComponent(businessId()) + "/transactions/" + encodeURIComponent(row.id), "PATCH", {
            title: title.trim(), amountToman: amountValue
          });
          say("تراکنش ویرایش شد.");
          await load();
        } catch (error) { say(error.message); edit.disabled = false; }
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "حذف";
      remove.addEventListener("click", async () => {
        if (!window.confirm("این تراکنش برای همیشه حذف شود؟")) return;
        remove.disabled = true;
        try {
          await api("/" + encodeURIComponent(businessId()) + "/transactions/" + encodeURIComponent(row.id), "DELETE");
          say("تراکنش حذف شد.");
          await load();
        } catch (error) { say(error.message); remove.disabled = false; }
      });
      actions.append(edit, remove);
      card.append(main, actions);
      container.append(card);
    }
    list.append(container);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const id = businessId();
    if (!id) { say("ابتدا یک پرونده کسب‌وکار انتخاب کن."); return; }
    const transactionType = $("bizTransactionType").value;
    const title = $("bizTransactionTitle").value.trim();
    const amountToman = Number($("bizTransactionAmount").value);
    const transactionDate = $("bizTransactionDate").value;
    if (title.length < 2 || !Number.isSafeInteger(amountToman) || amountToman <= 0 || !transactionDate) {
      say("عنوان، مبلغ صحیح و تاریخ را کامل کن.");
      return;
    }
    submit.disabled = true;
    try {
      await api("/" + encodeURIComponent(id) + "/transactions", "POST", {
        transactionType, title, amountToman, transactionDate,
        category: $("bizTransactionCategory").value.trim(),
        notes: $("bizTransactionNotes").value.trim()
      });
      form.reset();
      dateInput.value = localToday();
      say("تراکنش در پرونده فعال ثبت شد.");
      await load();
    } catch (error) { say(error.message); }
    finally { submit.disabled = false; }
  });

  if (dateInput && !dateInput.value) dateInput.value = localToday();
  $("bizProfileSelect")?.addEventListener("change", () => load().catch(error => say(error.message)));
  window.addEventListener("nava:business-selection-changed", () => load().catch(error => say(error.message)));
  window.addEventListener("nava:business-auth-changed", () => load().catch(error => say(error.message)));
  window.addEventListener("focus", () => load().catch(error => say(error.message)));
  load().catch(error => say(error.message));
})();
