/* NAVA BUSINESS TOOLS — independent, testable financial calculations */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const form = $("bizCostForm");
  if (!form) return;

  const numberFormat = new Intl.NumberFormat("fa-IR",{maximumFractionDigits:0});
  const money = value => numberFormat.format(Math.round(value)) + " تومان";
  const percent = value => new Intl.NumberFormat("fa-IR",{maximumFractionDigits:1}).format(value) + "٪";
  let latestReport = "";
  let latestRecordType = "cost_calculation";

  function parseNumber(raw) {
    if (raw === undefined || raw === null) return NaN;
    const normalized = String(raw)
      .trim()
      .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
      .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
      .replace(/[٬,]/g, "")
      .replace(/٫/g, ".")
      .replace(/[\s\u00a0]/g, "");
    if (!normalized) return NaN;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : NaN;
  }
  function readNumber(id) {
    const raw = $(id)?.value;
    return raw === undefined || raw === null || String(raw).trim() === "" ? 0 : parseNumber(raw);
  }
  function setText(id,value) { const node=$(id); if(node) node.textContent=value; }
  function readValues(mapping) { return Object.fromEntries(Object.entries(mapping).map(([key,id])=>[key,readNumber(id)])); }
  function nonNegative(values,ids) { return ids.every(id=>Number.isFinite(values[id]) && values[id]>=0); }

  function calculateCost(values) {
    const ids=["materials","packaging","labor","overhead","shipping"];
    if (!nonNegative(values,ids)) return {error:"هزینه‌ها باید عددی و صفر یا بیشتر باشند."};
    if (!Number.isInteger(values.quantity) || values.quantity<=0) return {error:"تعداد تولید باید عدد صحیح بزرگ‌تر از صفر باشد."};
    if (!Number.isFinite(values.margin) || values.margin<0 || values.margin>=100) return {error:"حاشیه سود باید از صفر تا کمتر از ۱۰۰ درصد باشد."};
    if (!Number.isInteger(values.salesQuantity) || values.salesQuantity<0) return {error:"تعداد فروش باید عدد صحیح و صفر یا بیشتر باشد."};
    const totalCost=ids.reduce((sum,id)=>sum+values[id],0);
    const unitCost=totalCost/values.quantity;
    const suggestedPrice=unitCost/(1-values.margin/100);
    const unitProfit=suggestedPrice-unitCost;
    const sold=Math.min(values.salesQuantity,values.quantity);
    return {totalCost,unitCost,suggestedPrice,unitProfit,sold,revenue:suggestedPrice*sold,totalProfit:unitProfit*sold,unsold:values.salesQuantity>values.quantity,quantity:values.quantity,margin:values.margin};
  }

  function calculateBreakEven(values) {
    const ids=["fixed","variable","price","targetProfit"];
    if (!nonNegative(values,ids)) return {error:"همه مبالغ باید عددی و صفر یا بیشتر باشند."};
    const contribution=values.price-values.variable;
    if (contribution<=0) return {error:"قیمت فروش باید بیشتر از هزینه متغیر هر واحد باشد؛ در غیر این صورت با فروش بیشتر هم به نقطه سربه‌سر نمی‌رسی."};
    const units=Math.ceil(values.fixed/contribution);
    const targetUnits=Math.ceil((values.fixed+values.targetProfit)/contribution);
    return {contribution,units,revenue:units*values.price,targetUnits,targetRevenue:targetUnits*values.price};
  }

  function calculateBudget(values) {
    const ids=["revenue","direct","fixed","payroll","marketing","other"];
    if (!nonNegative(values,ids)) return {error:"درآمد و هزینه‌ها باید عددی و صفر یا بیشتر باشند."};
    if (!Number.isFinite(values.reserve) || values.reserve<0 || values.reserve>100) return {error:"درصد ذخیره باید بین صفر تا ۱۰۰ باشد."};
    const expenses=ids.slice(1).reduce((sum,id)=>sum+values[id],0);
    const operatingProfit=values.revenue-expenses;
    const reserveAmount=Math.max(0,operatingProfit)*values.reserve/100;
    return {expenses,operatingProfit,reserveAmount,netAfterReserve:operatingProfit-reserveAmount,margin:values.revenue>0?operatingProfit/values.revenue*100:null,revenue:values.revenue,reservePercent:values.reserve};
  }

  function reportCost(values,result) {
    return [
      "گزارش محاسبه قیمت تمام‌شده و سود نوا",
      "مجموع هزینه تولید: "+money(result.totalCost),
      "تعداد تولید: "+result.quantity,
      "هزینه تمام‌شده هر واحد: "+money(result.unitCost),
      "حاشیه سود هدف از قیمت فروش: "+percent(result.margin),
      "قیمت فروش پیشنهادی هر واحد: "+money(result.suggestedPrice),
      "سود هر واحد: "+money(result.unitProfit),
      "تعداد فروش محاسباتی: "+result.sold,
      "درآمد فروش: "+money(result.revenue),
      "سود برآوردی: "+money(result.totalProfit),
      "توضیح: این محاسبه پیش از مالیات/کارمزد/تخفیف‌های ثبت‌نشده است."
    ].join("\n");
  }

  function renderCost() {
    const values=readValues({materials:"bizMaterials",packaging:"bizPackaging",labor:"bizLabor",overhead:"bizOverhead",shipping:"bizShipping",quantity:"bizQuantity",margin:"bizMargin",salesQuantity:"bizSalesQuantity"});
    const result=calculateCost(values);
    if (!result) return null;
    if (result.error) { setText("bizCostStatus",result.error); return null; }
    setText("bizSuggestedPrice",money(result.suggestedPrice));
    setText("bizTotalCost",money(result.totalCost));
    setText("bizUnitCost",money(result.unitCost));
    setText("bizUnitProfit",money(result.unitProfit));
    setText("bizTotalProfit",money(result.totalProfit));
    setText("bizExpectedRevenue",money(result.revenue));
    setText("bizCalculationSummary","با فروش "+numberFormat.format(result.sold)+" واحد از "+numberFormat.format(result.quantity)+" واحد تولیدشده، سود برآوردی "+money(result.totalProfit)+" است."+(result.unsold?" تعداد فروش واردشده از موجودی این نوبت بیشتر است؛ محاسبه بر اساس کل موجودی تولیدشده محدود شد.":""));
    setText("bizCostStatus","محاسبه با موفقیت انجام شد. برای تحلیل فرض‌ها می‌توانی نتیجه را به NAVI بدهی.");
    latestReport=reportCost(values,result);
    latestRecordType="cost_calculation";
    const copy=$("bizCopyResult"); if(copy) copy.disabled=false;
    return result;
  }

  function renderBreakEven() {
    const values=readValues({fixed:"bizBreakEvenFixed",variable:"bizBreakEvenVariable",price:"bizBreakEvenPrice",targetProfit:"bizBreakEvenTarget"});
    const result=calculateBreakEven(values);
    if (!result) return null;
    if (result.error) { setText("bizBreakEvenStatus",result.error); return null; }
    setText("bizBreakEvenUnits",numberFormat.format(result.units)+" واحد");
    setText("bizBreakEvenRevenue",money(result.revenue));
    setText("bizTargetUnits",numberFormat.format(result.targetUnits)+" واحد");
    setText("bizBreakEvenStatus","محاسبه انجام شد. حاشیه مشارکت هر واحد "+money(result.contribution)+" است.");
    latestRecordType="break_even";
    latestReport=[
      "گزارش نقطه سربه‌سر نوا",
      "هزینه ثابت دوره: "+money(values.fixed),
      "هزینه متغیر هر واحد: "+money(values.variable),
      "قیمت فروش هر واحد: "+money(values.price),
      "حاشیه مشارکت هر واحد: "+money(result.contribution),
      "حداقل فروش برای سربه‌سر: "+numberFormat.format(result.units)+" واحد",
      "درآمد نقطه سربه‌سر: "+money(result.revenue),
      "سود هدف: "+money(values.targetProfit),
      "تعداد فروش برای رسیدن به سود هدف: "+numberFormat.format(result.targetUnits)+" واحد",
      "توضیح: محاسبه بر اساس ثبات قیمت فروش و هزینه متغیر هر واحد در یک دوره انجام شده است."
    ].join("\n");
    return result;
  }

  function renderBudget() {
    const values=readValues({revenue:"bizBudgetRevenue",direct:"bizBudgetDirect",fixed:"bizBudgetFixed",payroll:"bizBudgetPayroll",marketing:"bizBudgetMarketing",other:"bizBudgetOther",reserve:"bizBudgetReserve"});
    const result=calculateBudget(values);
    if (!result) return null;
    if (result.error) { setText("bizBudgetStatus",result.error); return null; }
    setText("bizBudgetExpenses",money(result.expenses));
    setText("bizBudgetOperatingProfit",(result.operatingProfit<0?"کسری ":"مازاد ")+money(Math.abs(result.operatingProfit)));
    setText("bizBudgetReserveAmount",money(result.reserveAmount));
    setText("bizBudgetNet",(result.netAfterReserve<0?"کسری ":"مانده ")+money(Math.abs(result.netAfterReserve)));
    setText("bizBudgetMargin",result.margin===null?"قابل محاسبه نیست":percent(result.margin));
    setText("bizBudgetStatus",result.operatingProfit>=0?"بودجه مازاد عملیاتی دارد. ذخیره فقط از مازاد مثبت محاسبه شده است.":"بودجه با کسری عملیاتی روبه‌روست؛ ذخیره‌ای از کسری کسر نشده است.");
    latestRecordType="monthly_budget";
    latestReport=[
      "گزارش برنامه‌ریزی بودجه ماهانه نوا",
      "درآمد یا فروش پیش‌بینی‌شده: "+money(result.revenue),
      "هزینه مستقیم: "+money(values.direct),
      "هزینه ثابت: "+money(values.fixed),
      "حقوق و دستمزد: "+money(values.payroll),
      "بازاریابی و تبلیغات: "+money(values.marketing),
      "سایر هزینه‌ها: "+money(values.other),
      "مجموع هزینه‌ها: "+money(result.expenses),
      "مازاد/کسری عملیاتی: "+money(result.operatingProfit),
      "درصد ذخیره: "+percent(result.reservePercent),
      "مبلغ ذخیره پیشنهادی: "+money(result.reserveAmount),
      "مانده پس از ذخیره: "+money(result.netAfterReserve),
      "حاشیه عملیاتی: "+(result.margin===null?"قابل محاسبه نیست":percent(result.margin)),
      "توضیح: این بودجه پیش‌بینی ماهانه است و جایگزین ثبت جریان نقد واقعی یا صورت‌های مالی رسمی نیست."
    ].join("\n");
    return result;
  }

  form.addEventListener("submit",event=>{
    event.preventDefault();
    const result=renderCost();
    if (!result) return;
    const brief=$("studioBrief-biz");
    if (brief && !brief.value.trim()) brief.value="لطفاً نتیجه محاسبه زیر را تحلیل کن، ریسک‌های قیمت‌گذاری و هزینه‌های جاافتاده را توضیح بده و پیشنهادهای عملی برای افزایش سود ارائه کن.\n\n"+latestReport;
  });
  ["bizMaterials","bizPackaging","bizLabor","bizOverhead","bizShipping","bizQuantity","bizMargin","bizSalesQuantity"].forEach(id=>$(id)?.addEventListener("input",()=>renderCost()));

  const breakEvenForm=$("bizBreakEvenForm");
  breakEvenForm?.addEventListener("submit",event=>{event.preventDefault();renderBreakEven();});
  ["bizBreakEvenFixed","bizBreakEvenVariable","bizBreakEvenPrice","bizBreakEvenTarget"].forEach(id=>$(id)?.addEventListener("input",()=>renderBreakEven()));

  const budgetForm=$("bizBudgetForm");
  budgetForm?.addEventListener("submit",event=>{event.preventDefault();renderBudget();});
  ["bizBudgetRevenue","bizBudgetDirect","bizBudgetFixed","bizBudgetPayroll","bizBudgetMarketing","bizBudgetOther","bizBudgetReserve"].forEach(id=>$(id)?.addEventListener("input",()=>renderBudget()));

  $("bizCopyResult")?.addEventListener("click",async()=>{
    if (!latestReport) return;
    const button=$("bizCopyResult");
    try { await navigator.clipboard.writeText(latestReport); button.textContent="گزارش کپی شد"; }
    catch { button.textContent="کپی خودکار در دسترس نیست"; }
    setTimeout(()=>{button.textContent="کپی گزارش";},1800);
  });

  window.NavaBusinessTools={
    getReport:()=>latestReport,
    getRecordType:()=>latestRecordType,
    parseNumber,
    calculateCost,
    calculateBreakEven,
    calculateBudget
  };
  renderCost();
})();
