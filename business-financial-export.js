/* NAVA BUSINESS — monthly and annual financial report exports.
   All data is fetched from the authenticated business ledger. PDF uses the
   browser print engine so Persian text remains selectable and correctly shaped. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const yearSelect = $("bizExportYear");
  const monthSelect = $("bizExportMonth");
  const status = $("bizFinancialExportStatus");
  const profileSelect = $("bizProfileSelect");
  if (!yearSelect || !monthSelect || !status) return;

  const API = "https://nava-music-api.honrrpower.workers.dev/businesses";
  const months = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
  const partsFormatter = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC"
  });
  const dateFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
  });
  const money = value => Number(value || 0).toLocaleString("fa-IR");
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
  const token = () => {
    try {
      const expiry = Number(localStorage.getItem("nava_navi_expiry") || 0);
      const value = localStorage.getItem("nava_navi_session") || "";
      return expiry > Date.now() ? value : "";
    } catch { return ""; }
  };
  const isoDate = date => date.getUTCFullYear() + "-" +
    String(date.getUTCMonth() + 1).padStart(2, "0") + "-" +
    String(date.getUTCDate()).padStart(2, "0");
  const utcDate = iso => {
    const [year, month, day] = String(iso).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  };
  const persianParts = iso => {
    const values = {};
    for (const part of partsFormatter.formatToParts(utcDate(iso))) {
      if (part.type !== "literal") values[part.type] = Number(part.value);
    }
    return values;
  };
  function findMonthDates(year, month) {
    const dates = [];
    for (let time = Date.UTC(year + 621, 0, 1); time < Date.UTC(year + 623, 0, 1); time += 86400000) {
      const iso = isoDate(new Date(time));
      const parts = persianParts(iso);
      if (parts.year === year && parts.month === month) dates.push(iso);
    }
    return dates;
  }
  function initSelectors() {
    const today = persianParts(isoDate(new Date()));
    for (let year = today.year - 8; year <= today.year + 1; year++) {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = year.toLocaleString("fa-IR");
      if (year === today.year) option.selected = true;
      yearSelect.append(option);
    }
    months.forEach((name, index) => {
      const option = document.createElement("option");
      option.value = String(index + 1);
      option.textContent = name;
      monthSelect.append(option);
    });
    monthSelect.value = String(today.month);
  }
  function selectedProfile() {
    const option = profileSelect?.selectedOptions?.[0];
    return {
      id: profileSelect?.value || "",
      name: (option?.textContent || "کسب‌وکار").trim()
    };
  }
  async function fetchAllTransactions(businessId, from, to) {
    const auth = token();
    if (!auth) throw new Error("نشست حساب منقضی شده است؛ دوباره وارد نوا شو.");
    const all = [];
    const pageSize = 500;
    for (let offset = 0; offset <= 1000000; offset += pageSize) {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset), from, to });
      const response = await fetch(API + "/" + encodeURIComponent(businessId) + "/transactions?" + params, {
        headers: { Authorization: "Bearer " + auth }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "دریافت اطلاعات گزارش ناموفق بود.");
      const rows = Array.isArray(data.transactions) ? data.transactions : [];
      all.push(...rows);
      if (rows.length < pageSize) return all;
    }
    throw new Error("تعداد تراکنش‌ها از سقف ایمن خروجی بیشتر است. لطفاً گزارش را در بازه‌های کوچک‌تر بگیر.");
  }
  function buildReport(rows, profile, period, from, to) {
    const sales = rows.filter(row => row.transactionType === "sale");
    const expenses = rows.filter(row => row.transactionType === "expense");
    const salesTotal = sales.reduce((sum, row) => sum + Number(row.amountToman || 0), 0);
    const expensesTotal = expenses.reduce((sum, row) => sum + Number(row.amountToman || 0), 0);
    return {
      rows, profile, period, from, to, salesTotal, expensesTotal,
      difference: salesTotal - expensesTotal,
      salesCount: sales.length, expensesCount: expenses.length
    };
  }
  function fileBase(report, periodType) {
    const year = yearSelect.value;
    const month = monthSelect.value.padStart(2, "0");
    const clean = report.profile.name.replace(/[\\/:*?"<>|]/g, "-").replace(/\\s+/g, "-").slice(0, 35);
    return "NAVA-" + clean + "-" + (periodType === "month" ? year + "-" + month : year) + "-financial-report";
  }
  function downloadExcel(report, filename) {
    return loadXlsx().then(XLSX => {
      const workbook = XLSX.utils.book_new();
      workbook.Props = {
        Title: "گزارش مالی " + report.period,
        Subject: "NAVA BUSINESS",
        Author: "NAVA",
        Company: "NAVA"
      };
      const summaryRows = [
        ["گزارش مالی NAVA BUSINESS"],
        ["نام پرونده", report.profile.name],
        ["دوره گزارش", report.period],
        ["از تاریخ", dateFormatter.format(utcDate(report.from))],
        ["تا تاریخ", dateFormatter.format(utcDate(report.to))],
        [],
        ["شاخص", "مقدار"],
        ["مجموع فروش (تومان)", report.salesTotal],
        ["تعداد فروش", report.salesCount],
        ["مجموع هزینه (تومان)", report.expensesTotal],
        ["تعداد هزینه", report.expensesCount],
        ["تفاضل فروش و هزینه (تومان)", report.difference],
        ["تعداد کل تراکنش‌ها", report.rows.length],
        [],
        ["یادداشت", "تفاضل فروش و هزینه به‌تنهایی سود قطعی یا موجودی نقدی نیست."]
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      summarySheet["!cols"] = [{ wch: 34 }, { wch: 58 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, "خلاصه گزارش");
      const detailRows = [
        ["ردیف", "تاریخ شمسی", "نوع تراکنش", "عنوان", "دسته‌بندی", "مبلغ (تومان)", "تعداد", "قیمت واحد (تومان)", "توضیحات"]
      ];
      report.rows.forEach((row, index) => detailRows.push([
        index + 1,
        dateFormatter.format(utcDate(row.transactionDate)),
        row.transactionType === "sale" ? "فروش" : "هزینه",
        row.title || "",
        row.category || "",
        Number(row.amountToman || 0),
        row.quantity ?? "",
        row.unitPriceToman ?? "",
        row.notes || ""
      ]));
      const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
      detailSheet["!cols"] = [{ wch: 8 }, { wch: 22 }, { wch: 14 }, { wch: 28 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 22 }, { wch: 40 }];
      detailSheet["!autofilter"] = { ref: "A1:I" + Math.max(1, detailRows.length) };
      detailSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, detailSheet, "ریز تراکنش‌ها");
      XLSX.writeFile(workbook, filename, { compression: true });
    });
  }
  let xlsxPromise;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxPromise) return xlsxPromise;
    xlsxPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      script.async = true;
      script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("ابزار ساخت Excel بارگذاری نشد."));
      script.onerror = () => reject(new Error("دریافت ابزار Excel ناموفق بود؛ اتصال اینترنت را بررسی کن."));
      document.head.append(script);
    }).catch(error => { xlsxPromise = null; throw error; });
    return xlsxPromise;
  }
  function buildPrintHtml(report) {
    const rows = report.rows.map((row, index) => {
      const date = dateFormatter.format(utcDate(row.transactionDate));
      const type = row.transactionType === "sale" ? "فروش" : "هزینه";
      return "<tr><td>" + (index + 1).toLocaleString("fa-IR") + "</td><td>" + escapeHtml(date) +
        "</td><td>" + type + "</td><td>" + escapeHtml(row.title) + "</td><td>" +
        escapeHtml(row.category || "—") + "</td><td>" + money(row.amountToman) +
        "</td><td>" + escapeHtml(row.notes || "—") + "</td></tr>";
    }).join("");
    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<title>${escapeHtml("گزارش مالی " + report.period)}</title>
<style>
@page{size:A4 landscape;margin:12mm}
*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;color:#202b3c;font-size:10px;line-height:1.9;margin:0}
h1{font-size:20px;color:#17375e;margin:0 0 5px}h2{font-size:13px;color:#805c22;margin:18px 0 8px}
.header{border-bottom:2px solid #c89a4b;padding-bottom:12px;margin-bottom:14px}.meta{color:#596779}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:12px 0}
.card{border:1px solid #d8dee8;border-radius:8px;padding:10px;background:#f8fafc}.card span{display:block;color:#596779}.card strong{font-size:15px}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #d8dee8;padding:6px;text-align:right;vertical-align:top}
th{background:#edf1f7;color:#243c5a}tbody tr:nth-child(even){background:#f8fafc}
.note{margin-top:15px;padding:9px;border-right:3px solid #c89a4b;background:#fbf6eb;color:#596779}
@media screen{body{max-width:1100px;margin:20px auto;padding:24px;background:#fff;box-shadow:0 2px 22px #0002}}
@media print{thead{display:table-header-group}tr{break-inside:avoid}}
</style></head><body>
<div class="header"><h1>NAVA BUSINESS</h1><strong>گزارش مالی ${escapeHtml(report.period)}</strong>
<div class="meta">پرونده: ${escapeHtml(report.profile.name)} | از ${escapeHtml(dateFormatter.format(utcDate(report.from)))} تا ${escapeHtml(dateFormatter.format(utcDate(report.to)))}</div></div>
<div class="cards">
<div class="card"><span>مجموع فروش</span><strong>${money(report.salesTotal)} تومان</strong><div>${report.salesCount.toLocaleString("fa-IR")} مورد فروش</div></div>
<div class="card"><span>مجموع هزینه</span><strong>${money(report.expensesTotal)} تومان</strong><div>${report.expensesCount.toLocaleString("fa-IR")} مورد هزینه</div></div>
<div class="card"><span>تفاضل فروش و هزینه</span><strong>${money(report.difference)} تومان</strong><div>${report.rows.length.toLocaleString("fa-IR")} تراکنش</div></div>
</div>
<h2>ریز تراکنش‌ها</h2>
<table><thead><tr><th>ردیف</th><th>تاریخ</th><th>نوع</th><th>عنوان</th><th>دسته‌بندی</th><th>مبلغ (تومان)</th><th>توضیحات</th></tr></thead><tbody>${rows || '<tr><td colspan="7">در این بازه تراکنشی ثبت نشده است.</td></tr>'}</tbody></table>
<div class="note">توجه: تفاضل فروش و هزینه ثبت‌شده به‌تنهایی سود قطعی یا موجودی نقدی نیست. این گزارش بر اساس تراکنش‌های ثبت‌شده در پرونده تهیه شده است.</div>
<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),500));<\\/script>
</body></html>`;
  }
  async function runExport(button) {
    const periodType = button.dataset.businessExport;
    const format = button.dataset.format;
    const profile = selectedProfile();
    if (!profile.id) { status.textContent = "ابتدا یک پرونده کسب‌وکار انتخاب کن."; status.dataset.state = "error"; return; }
    const year = Number(yearSelect.value);
    const month = Number(monthSelect.value);
    const dates = periodType === "month" ? findMonthDates(year, month) : [
      ...findMonthDates(year, 1), ...findMonthDates(year, 2), ...findMonthDates(year, 3),
      ...findMonthDates(year, 4), ...findMonthDates(year, 5), ...findMonthDates(year, 6),
      ...findMonthDates(year, 7), ...findMonthDates(year, 8), ...findMonthDates(year, 9),
      ...findMonthDates(year, 10), ...findMonthDates(year, 11), ...findMonthDates(year, 12)
    ];
    if (!dates.length) { status.textContent = "تاریخ گزارش معتبر نیست."; status.dataset.state = "error"; return; }
    const from = dates[0], to = dates[dates.length - 1];
    const period = periodType === "month" ? months[month - 1] + " " + year.toLocaleString("fa-IR") : "سال " + year.toLocaleString("fa-IR");
    const popup = format === "pdf" ? window.open("", "_blank") : null;
    if (format === "pdf" && !popup) {
      status.textContent = "مرورگر پنجره گزارش را مسدود کرد؛ اجازه بازشدن پنجره برای سایت را فعال کن.";
      status.dataset.state = "error";
      return;
    }
    button.disabled = true;
    const oldLabel = button.textContent;
    button.textContent = "در حال آماده‌سازی...";
    status.textContent = "در حال دریافت و آماده‌سازی همه تراکنش‌های این بازه...";
    status.dataset.state = "";
    try {
      const rows = await fetchAllTransactions(profile.id, from, to);
      const report = buildReport(rows, profile, period, from, to);
      const base = fileBase(report, periodType);
      if (format === "xlsx") {
        await downloadExcel(report, base + ".xlsx");
        status.textContent = "فایل Excel شامل خلاصه گزارش و ریز همه " + rows.length.toLocaleString("fa-IR") + " تراکنش آماده شد.";
      } else {
        popup.document.open();
        popup.document.write(buildPrintHtml(report));
        popup.document.close();
        status.textContent = "گزارش PDF آماده است؛ در پنجره بازشده «ذخیره به‌صورت PDF» را انتخاب کن.";
      }
      status.dataset.state = "success";
    } catch (error) {
      if (popup && !popup.closed) popup.close();
      status.textContent = error.message || "ساخت گزارش ناموفق بود.";
      status.dataset.state = "error";
    } finally {
      button.disabled = false;
      button.textContent = oldLabel;
    }
  }
  document.querySelectorAll("[data-business-export]").forEach(button => {
    button.addEventListener("click", () => runExport(button));
  });
  initSelectors();
})();