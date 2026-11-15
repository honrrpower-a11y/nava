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
  const dateDisplay = $("bizTransactionDateDisplay");
  const calendar = $("bizTransactionCalendar");
  const calendarToggle = $("bizTransactionCalendarToggle");
  const calendarMonthLabel = $("bizCalendarMonth");
  const calendarDays = $("bizPersianCalendarDays");
  const persianPartsFormatter = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC"
  });
  const persianDateFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
  });
  const persianMonthFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric", month: "long", timeZone: "UTC"
  });
  let calendarYear = 0;
  let calendarMonth = 0;

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

  function utcDate(iso) {
    const [year, month, day] = String(iso).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  function persianParts(iso) {
    const parts = persianPartsFormatter.formatToParts(utcDate(iso));
    const values = {};
    for (const part of parts) if (part.type !== "literal") values[part.type] = Number(part.value);
    return { year: values.year, month: values.month, day: values.day };
  }

  function isoFromUtcDate(date) {
    return date.getUTCFullYear() + "-" +
      String(date.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(date.getUTCDate()).padStart(2, "0");
  }

  function formatPersianDate(iso) {
    if (!iso) return "";
    return persianDateFormatter.format(utcDate(iso));
  }

  function findPersianMonthDates(year, month) {
    const matches = [];
    const start = Date.UTC(year + 621, 0, 1);
    const end = Date.UTC(year + 623, 0, 1);
    for (let time = start; time < end; time += 86400000) {
      const date = new Date(time);
      const iso = isoFromUtcDate(date);
      const parts = persianParts(iso);
      if (parts.year === year && parts.month === month) {
        matches.push({ iso, day: parts.day, weekday: (date.getUTCDay() + 1) % 7 });
      }
    }
    return matches;
  }

  function showCalendar(open) {
    if (!calendar || !calendarToggle) return;
    calendar.hidden = !open;
    calendarToggle.setAttribute("aria-expanded", String(open));
    if (open) renderCalendar();
  }

  function renderCalendar() {
    if (!calendarDays || !calendarMonthLabel) return;
    const dates = findPersianMonthDates(calendarYear, calendarMonth);
    if (!dates.length) return;
    calendarMonthLabel.textContent = persianMonthFormatter.format(utcDate(dates[0].iso));
    calendarDays.replaceChildren();
    for (let i = 0; i < dates[0].weekday; i++) {
      const blank = document.createElement("span");
      blank.className = "biz-calendar-empty";
      calendarDays.append(blank);
    }
    for (const date of dates) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = date.day.toLocaleString("fa-IR");
      button.dataset.date = date.iso;
      if (date.iso === dateInput.value) {
        button.classList.add("is-selected");
        button.setAttribute("aria-pressed", "true");
      }
      button.addEventListener("click", () => {
        dateInput.value = date.iso;
        dateDisplay.value = formatPersianDate(date.iso);
        showCalendar(false);
      });
      calendarDays.append(button);
    }
  }

  function setDateValue(iso) {
    if (!dateInput || !dateDisplay) return;
    dateInput.value = iso;
    dateDisplay.value = formatPersianDate(iso);
    const parts = persianParts(iso);
    calendarYear = parts.year;
    calendarMonth = parts.month;
  }

  function moveCalendarMonth(delta) {
    calendarMonth += delta;
    if (calendarMonth < 1) { calendarMonth = 12; calendarYear--; }
    if (calendarMonth > 12) { calendarMonth = 1; calendarYear++; }
    renderCalendar();
  }

  calendarToggle?.addEventListener("click", () => {
    if (!dateInput.value) setDateValue(localToday());
    if (calendar.hidden) {
      const parts = persianParts(dateInput.value);
      calendarYear = parts.year;
      calendarMonth = parts.month;
    }
    showCalendar(calendar.hidden);
  });
  $("bizCalendarPrev")?.addEventListener("click", () => moveCalendarMonth(-1));
  $("bizCalendarNext")?.addEventListener("click", () => moveCalendarMonth(1));
  document.addEventListener("click", event => {
    if (calendar && !calendar.hidden &&
        !calendar.contains(event.target) &&
        !calendarToggle?.contains(event.target) &&
        !dateDisplay?.contains(event.target)) showCalendar(false);
  });

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
      meta.textContent = (row.transactionType === "sale" ? "فروش ثبت‌شده" : "هزینه ثبت‌شده") + " | " + formatPersianDate(row.transactionDate) + (row.category ? " | " + row.category : "");
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
      setDateValue(localToday());
      say("تراکنش در پرونده فعال ثبت شد.");
      await load();
    } catch (error) { say(error.message); }
    finally { submit.disabled = false; }
  });

  if (dateInput && !dateInput.value) setDateValue(localToday());
  $("bizProfileSelect")?.addEventListener("change", () => load().catch(error => say(error.message)));
  window.addEventListener("nava:business-selection-changed", () => load().catch(error => say(error.message)));
  window.addEventListener("nava:business-auth-changed", () => load().catch(error => say(error.message)));
  window.addEventListener("focus", () => load().catch(error => say(error.message)));
  load().catch(error => say(error.message));
})();
