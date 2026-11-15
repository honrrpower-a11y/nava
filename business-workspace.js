/* NAVA BUSINESS workspace — account-scoped profile and financial record UI */
(() => {
  "use strict";
  const API = "https://nava-music-api.honrrpower.workers.dev/businesses";
  const SESSION_KEY = "nava_navi_session";
  const EXPIRY_KEY = "nava_navi_expiry";
  const ACTIVE_KEY = "nava_business_active_id";
  const $ = id => document.getElementById(id);
  const form = $("bizProfileCreateForm");
  const select = $("bizProfileSelect");
  const status = $("bizProfileStatus");
  const activeName = $("bizProfileActiveName");
  const recent = $("bizProfileRecent");
  const saveButton = $("bizSaveFinancialRecord");
  if (!form || !select || !status || !saveButton) return;

  let businesses = [];
  let busy = false;
  const setStatus = message => { status.textContent = message; };
  function getToken() {
    try {
      const token = localStorage.getItem(SESSION_KEY);
      const expiry = Number(localStorage.getItem(EXPIRY_KEY) || 0);
      return token && expiry > Date.now() ? token : "";
    } catch { return ""; }
  }
  async function api(path = "", options = {}) {
    const token = getToken();
    if (!token) throw new Error("برای استفاده از پرونده کسب‌وکار ابتدا وارد حساب NAVI شو.");
    const response = await fetch(API + path, {
      method: options.method || "GET",
      headers: {
        "Authorization": "Bearer " + token,
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    let data;
    try { data = await response.json(); } catch { throw new Error("پاسخ سرویس کسب‌وکار معتبر نیست."); }
    if (response.status === 404) throw new Error("API پرونده‌های کسب‌وکار هنوز روی Worker فعال نشده است؛ نسخه جدید Worker باید Deploy شود.");
    if (!response.ok || !data.success) throw new Error(data.error || "درخواست کسب‌وکار انجام نشد.");
    return data;
  }
  function selectedBusiness() {
    return businesses.find(item => item.id === select.value) || null;
  }
  function renderBusinesses(preferredId = "") {
    const currentId = preferredId || select.value || localStorage.getItem(ACTIVE_KEY) || "";
    select.replaceChildren();
    if (!businesses.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "هنوز پرونده‌ای ساخته نشده";
      select.append(option);
      select.disabled = true;
      activeName.textContent = "برای شروع، اولین پرونده کسب‌وکارت را بساز.";
      saveButton.disabled = true;
      return;
    }
    for (const business of businesses) {
      const option = document.createElement("option");
      option.value = business.id;
      option.textContent = business.name;
      select.append(option);
    }
    select.disabled = false;
    select.value = businesses.some(item => item.id === currentId) ? currentId : businesses[0].id;
    try { localStorage.setItem(ACTIVE_KEY, select.value); } catch {}
    const selected = selectedBusiness();
    activeName.textContent = selected ? "پرونده فعال: " + selected.name : "";
    saveButton.disabled = !selected;
    loadRecords().catch(error => { recent.textContent = error.message; });
  }
  function labelType(type) {
    return ({cost_calculation:"قیمت تمام‌شده",break_even:"نقطه سربه‌سر",monthly_budget:"بودجه ماهانه",note:"یادداشت مالی"})[type] || "گزارش مالی";
  }
  async function loadRecords() {
    const business = selectedBusiness();
    if (!business) { recent.textContent = "پرونده‌ای برای نمایش سوابق انتخاب نشده است."; return; }
    const data = await api("/" + encodeURIComponent(business.id) + "/records?limit=8");
    recent.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = "آخرین سوابق مالی";
    recent.append(heading);
    if (!data.records.length) {
      const empty = document.createElement("p");
      empty.textContent = "هنوز گزارشی در این پرونده ذخیره نشده است.";
      recent.append(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "biz-record-list";
    for (const record of data.records) {
      const item = document.createElement("article");
      item.className = "biz-record-item";
      const header = document.createElement("div");
      header.className = "biz-record-header";
      const title = document.createElement("strong");
      const typeLabel = labelType(record.recordType);
      title.textContent = record.title && record.title !== typeLabel ? record.title + " — " + typeLabel : typeLabel;
      const date = document.createElement("small");
      date.textContent = "تاریخ ثبت: " + (record.createdAt || "نامشخص");
      header.append(title, date);

      const details = document.createElement("details");
      details.className = "biz-record-details";
      const summary = document.createElement("summary");
      summary.textContent = "مشاهده جزئیات گزارش";
      const report = document.createElement("pre");
      report.className = "biz-record-report";
      report.textContent = record.reportText || "متن جزئیات برای این گزارش ذخیره نشده است.";
      details.append(summary, report);
      if (record.payload && Object.keys(record.payload).length) {
        const payloadHeading = document.createElement("strong");
        payloadHeading.className = "biz-record-data-heading";
        payloadHeading.textContent = "داده‌های ساختاریافته محاسبه";
        const payload = document.createElement("pre");
        payload.className = "biz-record-report biz-record-payload";
        payload.textContent = JSON.stringify(record.payload, null, 2);
        details.append(payloadHeading, payload);
      }

      const actions = document.createElement("div");
      actions.className = "biz-record-actions";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "biz-record-delete";
      remove.textContent = "حذف گزارش";
      remove.addEventListener("click", async () => {
        if (!window.confirm("این گزارش مالی برای همیشه حذف شود؟")) return;
        remove.disabled = true;
        try {
          await api("/" + encodeURIComponent(business.id) + "/records/" + encodeURIComponent(record.id), { method:"DELETE" });
          setStatus("گزارش «" + typeLabel + "» حذف شد.");
          await loadRecords();
        } catch (error) {
          setStatus(error.message);
          remove.disabled = false;
        }
      });
      actions.append(remove);
      item.append(header, details, actions);
      list.append(item);
    }
    recent.append(list);
  }
  async function loadBusinesses() {
    if (busy) return;
    if (!getToken()) {
      businesses = [];
      select.replaceChildren();
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "ابتدا وارد حساب نوا شو";
      select.append(option);
      select.disabled = true;
      saveButton.disabled = true;
      activeName.textContent = "هنوز پرونده‌ای انتخاب نشده است.";
      recent.textContent = "برای مشاهده سوابق مالی وارد حساب NAVI شو.";
      setStatus("برای ساخت و ذخیره پرونده، ابتدا وارد حساب NAVI شو.");
      return;
    }
    try {
      const data = await api();
      businesses = data.businesses || [];
      renderBusinesses();
      setStatus(businesses.length ? "پرونده‌ها به‌صورت اختصاصی برای حساب واردشده بارگذاری شدند." : "هنوز پرونده‌ای نداری؛ می‌توانی اولین کسب‌وکارت را ثبت کنی.");
    } catch (error) {
      setStatus(error.message);
      if (/ساختار دیتابیس|عملیات کسب‌وکار|هنوز روی Worker فعال/.test(error.message)) {
        recent.textContent = "ساختار دیتابیس هنوز روی سرویس فعال نشده است؛ پس از اجرای Migration، دوباره بارگذاری کن.";
      }
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const name = $("bizProfileName").value.trim();
    const businessType = $("bizProfileType").value;
    if (name.length < 2) { setStatus("نام کسب‌وکار باید حداقل ۲ نویسه باشد."); return; }
    busy = true;
    $("bizProfileCreateButton").disabled = true;
    try {
      const data = await api("", { method:"POST", body:{ name, businessType } });
      businesses.unshift(data.business);
      form.reset();
      renderBusinesses(data.business.id);
      setStatus("پرونده «" + data.business.name + "» ساخته شد و به حساب تو اختصاص دارد.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      busy = false;
      $("bizProfileCreateButton").disabled = false;
    }
  });

  select.addEventListener("change", () => {
    const business = selectedBusiness();
    if (business) {
      try { localStorage.setItem(ACTIVE_KEY, business.id); } catch {}
      activeName.textContent = "پرونده فعال: " + business.name;
      saveButton.disabled = false;
      loadRecords().catch(error => { recent.textContent = error.message; });
    }
  });

  saveButton.addEventListener("click", async () => {
    const business = selectedBusiness();
    const report = window.NavaBusinessTools?.getReport?.() || "";
    const recordType = window.NavaBusinessTools?.getRecordType?.() || "";
    if (!business) { setStatus("ابتدا یک پرونده کسب‌وکار انتخاب کن."); return; }
    if (!report.trim()) { setStatus("ابتدا یکی از محاسبات مالی را انجام بده."); return; }
    saveButton.disabled = true;
    try {
      await api("/" + encodeURIComponent(business.id) + "/records", {
        method:"POST",
        body:{ recordType, title:labelType(recordType), reportText:report, payload:{} }
      });
      setStatus("گزارش در پرونده «" + business.name + "» ذخیره شد.");
      await loadRecords();
    } catch (error) {
      setStatus(error.message);
    } finally {
      saveButton.disabled = !selectedBusiness();
    }
  });

  window.addEventListener("nava:business-auth-changed", loadBusinesses);
  window.addEventListener("focus", loadBusinesses);
  loadBusinesses();
})();
