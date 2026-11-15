/* NAVA BUSINESS TOOLS — client-side financial calculations */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const form = $("bizCostForm");
  if (!form) return;

  const fields = ["bizMaterials","bizPackaging","bizLabor","bizOverhead","bizShipping","bizQuantity","bizMargin","bizSalesQuantity"];
  const read = id => {
    const el = $(id);
    const value = Number(el?.value);
    return Number.isFinite(value) ? value : NaN;
  };
  const money = value => new Intl.NumberFormat("fa-IR",{maximumFractionDigits:0}).format(Math.round(value)) + " تومان";
  const percent = value => new Intl.NumberFormat("fa-IR",{maximumFractionDigits:1}).format(value) + "٪";
  let latestReport = "";

  function calculate(showErrors = false) {
    const values = Object.fromEntries(fields.map(id => [id,read(id)]));
    const costIds = fields.slice(0,5);
    if (costIds.some(id => !Number.isFinite(values[id]) || values[id] < 0)) {
      if (showErrors) $("bizCostStatus").textContent = "هزینه‌ها باید عددی و صفر یا بیشتر باشند.";
      return null;
    }
    if (!Number.isFinite(values.bizQuantity) || values.bizQuantity <= 0 || !Number.isInteger(values.bizQuantity)) {
      if (showErrors) $("bizCostStatus").textContent = "تعداد تولید باید یک عدد صحیح بزرگ‌تر از صفر باشد.";
      return null;
    }
    if (!Number.isFinite(values.bizMargin) || values.bizMargin < 0 || values.bizMargin >= 100) {
      if (showErrors) $("bizCostStatus").textContent = "حاشیه سود باید از صفر تا کمتر از ۱۰۰ درصد باشد.";
      return null;
    }
    if (!Number.isFinite(values.bizSalesQuantity) || values.bizSalesQuantity < 0 || !Number.isInteger(values.bizSalesQuantity)) {
      if (showErrors) $("bizCostStatus").textContent = "تعداد فروش باید عدد صحیح و صفر یا بیشتر باشد.";
      return null;
    }
    const totalCost = costIds.reduce((sum,id) => sum + values[id],0);
    const unitCost = totalCost / values.bizQuantity;
    const margin = values.bizMargin / 100;
    const suggestedPrice = margin === 0 ? unitCost : unitCost / (1-margin);
    const unitProfit = suggestedPrice - unitCost;
    const sold = Math.min(values.bizSalesQuantity,values.bizQuantity);
    const revenue = suggestedPrice * sold;
    const totalProfit = unitProfit * sold;
    const unsold = values.bizSalesQuantity > values.bizQuantity;
    $("bizSuggestedPrice").textContent = money(suggestedPrice);
    $("bizTotalCost").textContent = money(totalCost);
    $("bizUnitCost").textContent = money(unitCost);
    $("bizUnitProfit").textContent = money(unitProfit);
    $("bizTotalProfit").textContent = money(totalProfit);
    $("bizExpectedRevenue").textContent = money(revenue);
    $("bizCalculationSummary").textContent = "با فروش " + new Intl.NumberFormat("fa-IR").format(sold) + " واحد از " + new Intl.NumberFormat("fa-IR").format(values.bizQuantity) + " واحد تولیدشده، سود برآوردی " + money(totalProfit) + " است." + (unsold ? " تعداد فروش واردشده از موجودی این نوبت بیشتر است؛ محاسبه بر اساس کل موجودی تولیدشده محدود شد." : "");
    $("bizCostStatus").textContent = "محاسبه با موفقیت انجام شد. برای تحلیل فرض‌ها می‌توانی نتیجه را به NAVI بدهی.";
    latestReport = [
      "گزارش محاسبه قیمت تمام‌شده و سود نوا",
      "مجموع هزینه تولید: " + money(totalCost),
      "تعداد تولید: " + values.bizQuantity,
      "هزینه تمام‌شده هر واحد: " + money(unitCost),
      "حاشیه سود هدف از قیمت فروش: " + percent(values.bizMargin),
      "قیمت فروش پیشنهادی هر واحد: " + money(suggestedPrice),
      "سود هر واحد: " + money(unitProfit),
      "تعداد فروش محاسباتی: " + sold,
      "درآمد فروش: " + money(revenue),
      "سود برآوردی: " + money(totalProfit),
      "توضیح: این محاسبه پیش از مالیات/کارمزد/تخفیف‌های ثبت‌نشده است."
    ].join("\n");
    $("bizCopyResult").disabled = false;
    return {values,totalCost,unitCost,suggestedPrice,unitProfit,sold,revenue,totalProfit};
  }

  form.addEventListener("submit",event => {
    event.preventDefault();
    const result = calculate(true);
    if (!result) return;
    const brief = $("studioBrief-biz");
    if (brief && !brief.value.trim()) {
      brief.value = "لطفاً نتیجه محاسبه زیر را تحلیل کن، ریسک‌های قیمت‌گذاری و هزینه‌های جاافتاده را توضیح بده و پیشنهادهای عملی برای افزایش سود ارائه کن.\n\n" + latestReport;
    }
  });
  fields.forEach(id => $(id)?.addEventListener("input",() => calculate(false)));
  $("bizCopyResult")?.addEventListener("click",async () => {
    if (!latestReport) return;
    const button=$("bizCopyResult");
    try {
      await navigator.clipboard.writeText(latestReport);
      button.textContent="گزارش کپی شد";
    } catch {
      button.textContent="کپی خودکار در دسترس نیست";
    }
    setTimeout(()=>{button.textContent="کپی گزارش"},1800);
  });
  window.NavaBusinessTools = { getReport: () => latestReport };
  calculate(false);
})();
