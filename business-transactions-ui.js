/* NAVA BUSINESS — Toman sales and expense ledger UI */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const form = $("bizTransactionForm");
  if (!form) return;
  const list = $("bizTransactionList");
  const summary = $("bizTransactionSummary");
  const dashboard = $("bizFinancialDashboard");
  const status = $("bizTransactionStatus");
  const submit = $("bizTransactionSubmit");
  const catalogSelect = $("bizTransactionCatalogItem");
  const customerSelect = $("bizTransactionCustomer");
  const saleDetails = $("bizSaleCatalogDetails");
  const quantityInput = $("bizTransactionQuantity");
  const unitPriceInput = $("bizTransactionUnitPrice");
  const dateInput = $("bizTransactionDate");
  const dateDisplay = $("bizTransactionDateDisplay");
  const calendar = $("bizTransactionCalendar");
  const calendarToggle = $("bizTransactionCalendarToggle");
  const calendarMonthLabel = $("bizCalendarMonth");
  const calendarDays = $("bizPersianCalendarDays");
  const filterMode = $("bizDashboardFilterMode");
  const monthFilter = $("bizDashboardMonthFilter");
  const rangeFilter = $("bizDashboardRangeFilter");
  const filterYear = $("bizDashboardYear");
  const filterMonth = $("bizDashboardMonth");
  const rangeFrom = $("bizDashboardFrom");
  const rangeTo = $("bizDashboardTo");
  const applyFilterButton = $("bizDashboardApplyFilter");
  const resetFilterButton = $("bizDashboardResetFilter");
  const filterStatus = $("bizDashboardFilterStatus");
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
  let catalogItems = [];

  function updateSaleTotal() {
    if (!catalogSelect?.value) return;
    const quantityText = normalizeDigits(quantityInput?.value || "").trim();
    const quantity = quantityText ? Number(quantityText) : 1;
    const unitPrice = Number(normalizeDigits(unitPriceInput?.value || ""));
    const total = quantity * unitPrice;
    if (Number.isSafeInteger(quantity) && quantity > 0 && Number.isSafeInteger(unitPrice) && unitPrice > 0 && Number.isSafeInteger(total)) {
      $("bizTransactionAmount").value = String(total);
    }
  }

  function renderCatalogOptions(items) {
    if (!catalogSelect) return;
    const selected = catalogSelect.value;
    catalogSelect.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "فروش دستی / بدون اتصال به کاتالوگ";
    catalogSelect.append(empty);
    for (const item of items) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name + " — " + money(item.salePriceToman) + " / " + (item.unit || "عدد");
      catalogSelect.append(option);
    }
    if (items.some(item => item.id === selected)) catalogSelect.value = selected;
  }

  async function loadCustomerOptions(id) {
    if (!customerSelect) return;
    const selected = customerSelect.value;
    customerSelect.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "بدون اتصال به مشتری";
    customerSelect.append(empty);
    if (!id) return;
    const data = await api("/" + encodeURIComponent(id) + "/customers?status=active");
    for (const customer of data.customers || []) {
      const option = document.createElement("option");
      option.value = customer.id;
      option.textContent = customer.name;
      customerSelect.append(option);
    }
    if ([...customerSelect.options].some(option => option.value === selected)) customerSelect.value = selected;
  }

  async function loadCatalogItems(id) {
    if (!catalogSelect || !id) { catalogItems = []; renderCatalogOptions([]); return; }
    const data = await api("/" + encodeURIComponent(id) + "/items?status=active&type=all");
    catalogItems = Array.isArray(data.items) ? data.items : [];
    renderCatalogOptions(catalogItems);
  }

  function syncTransactionType() {
    const isSale = $("bizTransactionType")?.value === "sale";
    if (saleDetails) saleDetails.hidden = !isSale;
    if (!isSale && catalogSelect) catalogSelect.value = "";
  }

  catalogSelect?.addEventListener("change", () => {
    const item = catalogItems.find(entry => entry.id === catalogSelect.value);
    if (item) {
      $("bizTransactionTitle").value = item.name;
      unitPriceInput.value = String(item.salePriceToman);
      $("bizTransactionCategory").value = item.category || "";
      updateSaleTotal();
    }
  });
  $("bizTransactionAmount")?.addEventListener("input", event => {
    const field = event.currentTarget;
    const normalized = normalizeDigits(field.value);
    if (field.value !== normalized) field.value = normalized;
  });
  quantityInput?.addEventListener("input", updateSaleTotal);
  unitPriceInput?.addEventListener("input", updateSaleTotal);
  $("bizTransactionType")?.addEventListener("change", syncTransactionType);

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

  function renderDashboard(totals, monthlyTrend) {
    if (!dashboard) return;
    dashboard.replaceChildren();
    const sales = Number(totals.salesToman || 0);
    const expenses = Number(totals.expensesToman || 0);
    const difference = sales - expenses;
    const cards = [
      { label: "مجموع فروش ثبت‌شده", value: sales, count: Number(totals.salesCount || 0), kind: "sale" },
      { label: "مجموع هزینه ثبت‌شده", value: expenses, count: Number(totals.expensesCount || 0), kind: "expense" },
      { label: "تفاضل فروش و هزینه", value: difference, count: Number(totals.transactionCount || 0), kind: "difference" }
    ];
    const grid = document.createElement("div");
    grid.className = "biz-dashboard-kpis";
    for (const item of cards) {
      const card = document.createElement("article");
      card.className = "biz-dashboard-kpi";
      card.dataset.kind = item.kind;
      const label = document.createElement("span");
      label.textContent = item.label;
      const value = document.createElement("strong");
      value.textContent = (item.kind === "difference" && difference > 0 ? "+" : "") + money(item.value);
      const count = document.createElement("small");
      count.textContent = item.kind === "difference"
        ? Number(totals.transactionCount || 0).toLocaleString("fa-IR") + " تراکنش در مجموع"
        : Number(item.count).toLocaleString("fa-IR") + (item.kind === "sale" ? " مورد فروش" : " مورد هزینه");
      card.append(label, value, count);
      grid.append(card);
    }
    dashboard.append(grid);

    const trendTitle = document.createElement("h4");
    trendTitle.className = "biz-dashboard-trend-title";
    trendTitle.textContent = "روند شش ماه اخیر";
    dashboard.append(trendTitle);
    if (!monthlyTrend.length) {
      const empty = document.createElement("p");
      empty.className = "biz-dashboard-empty";
      empty.textContent = "برای نمایش روند ماهانه، هنوز تراکنش کافی ثبت نشده است.";
      dashboard.append(empty);
      return;
    }
    const maxValue = Math.max(1, ...monthlyTrend.flatMap(row => [Number(row.salesToman || 0), Number(row.expensesToman || 0)]));
    const chart = document.createElement("div");
    chart.className = "biz-dashboard-trend";
    for (const row of monthlyTrend) {
      const monthDate = utcDate(row.month + "-01");
      const monthLabel = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        month: "long", year: "numeric", timeZone: "UTC"
      }).format(monthDate);
      const group = document.createElement("div");
      group.className = "biz-dashboard-month";
      const label = document.createElement("strong");
      label.textContent = monthLabel;
      const bars = document.createElement("div");
      bars.className = "biz-dashboard-bars";
      for (const kind of ["sale", "expense"]) {
        const value = Number(row[kind === "sale" ? "salesToman" : "expensesToman"] || 0);
        const barRow = document.createElement("div");
        barRow.className = "biz-dashboard-bar-row";
        const name = document.createElement("span");
        name.textContent = kind === "sale" ? "فروش" : "هزینه";
        const track = document.createElement("div");
        track.className = "biz-dashboard-bar-track";
        const fill = document.createElement("i");
        fill.className = "biz-dashboard-bar-fill";
        fill.dataset.kind = kind;
        fill.style.width = (value ? Math.max(2, value / maxValue * 100) : 0) + "%";
        track.append(fill);
        const amount = document.createElement("small");
        amount.textContent = money(value);
        barRow.append(name, track, amount);
        bars.append(barRow);
      }
      group.append(label, bars);
      chart.append(group);
    }
    dashboard.append(chart);
    const legend = document.createElement("p");
    legend.className = "biz-dashboard-legend";
    legend.textContent = "مقیاس میله‌ها برای مقایسه نسبی ماه‌هاست؛ مبالغ کنار هر میله مقدار دقیق را نشان می‌دهند.";
    dashboard.append(legend);
  }

  function normalizeDigits(value) {
    return String(value || "").replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  }

  function parsePersianDate(value) {
    const match = normalizeDigits(value).trim().match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const found = findPersianMonthDates(year, month).find(item => item.day === day);
    return found ? found.iso : null;
  }

  function setupDashboardFilters() {
    if (!filterYear || !filterMonth) return;
    const today = persianParts(localToday());
    for (let year = today.year - 5; year <= today.year + 1; year++) {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = year.toLocaleString("fa-IR");
      if (year === today.year) option.selected = true;
      filterYear.append(option);
    }
    const monthNames = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
    monthNames.forEach((name, index) => {
      const option = document.createElement("option");
      option.value = String(index + 1);
      option.textContent = name;
      filterMonth.append(option);
    });
    filterMonth.value = String(today.month);
    filterMode?.addEventListener("change", () => {
      if (monthFilter) monthFilter.hidden = filterMode.value !== "month";
      if (rangeFilter) rangeFilter.hidden = filterMode.value !== "range";
      if (filterStatus) filterStatus.textContent = "";
    });
    applyFilterButton?.addEventListener("click", () => load().catch(error => say(error.message)));
    resetFilterButton?.addEventListener("click", () => {
      if (filterMode) filterMode.value = "all";
      if (monthFilter) monthFilter.hidden = true;
      if (rangeFilter) rangeFilter.hidden = true;
      if (rangeFrom) rangeFrom.value = "";
      if (rangeTo) rangeTo.value = "";
      if (filterStatus) filterStatus.textContent = "نمایش همه سوابق";
      load().catch(error => say(error.message));
    });
  }

  function selectedDateRange() {
    if (!filterMode || filterMode.value === "all") return { from: "", to: "", label: "کل سوابق ثبت‌شده" };
    if (filterMode.value === "month") {
      const year = Number(filterYear?.value);
      const month = Number(filterMonth?.value);
      const dates = findPersianMonthDates(year, month);
      if (!dates.length) throw new Error("ماه انتخاب‌شده معتبر نیست.");
      return {
        from: dates[0].iso,
        to: dates[dates.length - 1].iso,
        label: persianMonthFormatter.format(utcDate(dates[0].iso))
      };
    }
    const fromText = rangeFrom?.value.trim() || "";
    const toText = rangeTo?.value.trim() || "";
    const from = fromText ? parsePersianDate(fromText) : "";
    const to = toText ? parsePersianDate(toText) : "";
    if ((fromText && !from) || (toText && !to)) throw new Error("تاریخ را به شکل سال/ماه/روز شمسی وارد کن؛ مثال: ۱۴۰۵/۰۸/۰۱");
    if (!from && !to) throw new Error("حداقل یکی از تاریخ شروع یا پایان را وارد کن.");
    if (from && to && from > to) throw new Error("تاریخ شروع نباید بعد از تاریخ پایان باشد.");
    return { from, to, label: (fromText || "ابتدا") + " تا " + (toText || "امروز") };
  }

  async function load() {
    const id = businessId();
    if (!id) {
      if (list) list.textContent = "برای نمایش تراکنش‌ها یک پرونده فعال انتخاب کن.";
      if (summary) summary.textContent = "";
      if (dashboard) dashboard.textContent = "برای نمایش داشبورد، یک پرونده فعال انتخاب کن.";
      return;
    }
    let range;
    try { range = selectedDateRange(); }
    catch (error) { if (filterStatus) filterStatus.textContent = error.message; return; }
    const params = new URLSearchParams({ limit: "200" });
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    await Promise.all([loadCatalogItems(id), loadCustomerOptions(id)]);
    syncTransactionType();
    const data = await api("/" + encodeURIComponent(id) + "/transactions?" + params.toString());
    const rows = data.transactions || [];
    const totals = data.summary || {};
    const sales = Number(totals.salesToman || 0);
    const expenses = Number(totals.expensesToman || 0);
    summary.textContent = "کل سوابق — فروش ثبت‌شده: " + money(sales) + " | هزینه ثبت‌شده: " + money(expenses) + " | تفاضل ثبت‌شده: " + money(sales - expenses);
    renderDashboard(totals, data.monthlyTrend || []);
    const periodBadge = document.querySelector("#bizPage .biz-dashboard-period");
    if (periodBadge) periodBadge.textContent = range.label;
    if (filterStatus) filterStatus.textContent = "نمایش " + Number(totals.transactionCount || 0).toLocaleString("fa-IR") + " تراکنش در این بازه";
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
        const title = await window.navaPrompt("عنوان تراکنش را وارد کن:", row.title, { title: "ویرایش تراکنش", confirmText: "ادامه", placeholder: "عنوان تراکنش" });
        if (title === null) return;
        const amountText = await window.navaPrompt("مبلغ تراکنش را به تومان وارد کن:", String(row.amountToman), { title: "ویرایش مبلغ", confirmText: "ذخیره مبلغ", placeholder: "مبلغ به تومان" });
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
        if (!await window.navaConfirm("این تراکنش برای همیشه حذف شود؟", { title: "حذف تراکنش", confirmText: "حذف دائمی", danger: true })) return;
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
    const amountToman = Number(normalizeDigits($("bizTransactionAmount").value || "").trim());
    const transactionDate = $("bizTransactionDate").value;
    if (title.length < 2 || !Number.isSafeInteger(amountToman) || amountToman <= 0 || !transactionDate) {
      say("عنوان، مبلغ صحیح و تاریخ را کامل کن.");
      return;
    }
    submit.disabled = true;
    try {
      await api("/" + encodeURIComponent(id) + "/transactions", "POST", {
        transactionType, title, amountToman, transactionDate,
        ...(transactionType === "sale" && customerSelect?.value ? { customerId: customerSelect.value } : {}),
        category: $("bizTransactionCategory").value.trim(),
        notes: $("bizTransactionNotes").value.trim(),
        ...(transactionType === "sale" && catalogSelect?.value ? {
          catalogItemId: catalogSelect.value,
          quantity: normalizeDigits(quantityInput.value).trim() ? Number(normalizeDigits(quantityInput.value).trim()) : 1,
          unitPriceToman: Number(normalizeDigits(unitPriceInput.value))
        } : {})
      });
      form.reset();
      syncTransactionType();
      setDateValue(localToday());
      say("تراکنش در پرونده فعال ثبت شد.");
      await load();
    } catch (error) { say(error.message); }
    finally { submit.disabled = false; }
  });

  if (dateInput && !dateInput.value) setDateValue(localToday());
  setupDashboardFilters();
  $("bizProfileSelect")?.addEventListener("change", () => load().catch(error => say(error.message)));
  window.addEventListener("nava:business-selection-changed", () => load().catch(error => say(error.message)));
  window.addEventListener("nava:business-auth-changed", () => load().catch(error => say(error.message)));
  window.addEventListener("nava:business-order-updated", () => load().catch(error => say(error.message)));
  window.addEventListener("focus", () => load().catch(error => say(error.message)));
  load().catch(error => say(error.message));
})();
