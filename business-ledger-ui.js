/* NAVA BUSINESS — suppliers, cash accounts and settlement UI. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const root = $("bizLedgerWorkspace");
  if (!root) return;
  const API = "https://nava-music-api.honrrpower.workers.dev/businesses";
  const token = () => {
    try {
      return Number(localStorage.getItem("nava_navi_expiry") || 0) > Date.now()
        ? localStorage.getItem("nava_navi_session") || "" : "";
    } catch { return ""; }
  };
  const businessId = () => $("bizProfileSelect")?.value || "";
  const digits = value => String(value || "").replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const money = value => Number(value || 0).toLocaleString("fa-IR") + " تومان";
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  let suppliers = [], accounts = [], expenses = [], inventoryItems = [], purchases = [];
  const persianPartsFormatter = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn",{year:"numeric",month:"numeric",day:"numeric",timeZone:"UTC"});
  const persianDateFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian",{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"});
  const persianMonthFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian",{year:"numeric",month:"long",timeZone:"UTC"});
  const utcDate = iso => {const [y,m,d]=String(iso||"").split("-").map(Number);return new Date(Date.UTC(y,m-1,d));};
  const isoDate = d => d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0");
  const persianParts = iso => {const out={};for(const p of persianPartsFormatter.formatToParts(utcDate(iso)))if(p.type!=="literal")out[p.type]=Number(p.value);return out;};
  const formatPersianDate = iso => iso?persianDateFormatter.format(utcDate(iso)):"";
  function setupPersianDatePicker(id){
    const input=$(id),display=$(id+"Display"),calendar=$(id+"Calendar"),toggle=$(id+"Toggle"),monthLabel=$(id+"Month"),days=$(id+"Days");
    if(!input||!display||!calendar||!toggle||!monthLabel||!days)return{set(){}};
    let year=0,month=0;
    const picker={set(iso){input.value=iso||"";display.value=formatPersianDate(iso);if(iso){const p=persianParts(iso);year=p.year;month=p.month;}}};
    const render=()=>{
      const dates=[],start=Date.UTC(year+621,0,1),end=Date.UTC(year+623,0,1);
      for(let t=start;t<end;t+=86400000){const d=new Date(t),iso=isoDate(d),p=persianParts(iso);if(p.year===year&&p.month===month)dates.push({iso,day:p.day,weekday:(d.getUTCDay()+1)%7});}
      if(!dates.length)return;monthLabel.textContent=persianMonthFormatter.format(utcDate(dates[0].iso));days.replaceChildren();
      for(let i=0;i<dates[0].weekday;i++){const blank=document.createElement("span");blank.className="biz-calendar-empty";days.append(blank);}
      for(const d of dates){const b=document.createElement("button");b.type="button";b.textContent=d.day.toLocaleString("fa-IR");if(d.iso===input.value){b.classList.add("is-selected");b.setAttribute("aria-pressed","true");}b.addEventListener("click",()=>{picker.set(d.iso);calendar.hidden=true;toggle.setAttribute("aria-expanded","false");});days.append(b);}
    };
    toggle.addEventListener("click",()=>{calendar.hidden=!calendar.hidden;toggle.setAttribute("aria-expanded",String(!calendar.hidden));if(!calendar.hidden)render();});
    calendar.querySelectorAll("[data-month]").forEach(b=>b.addEventListener("click",()=>{month+=Number(b.dataset.month);if(month<1){month=12;year--;}if(month>12){month=1;year++;}render();}));
    document.addEventListener("click",e=>{if(!calendar.contains(e.target)&&!toggle.contains(e.target)){calendar.hidden=true;toggle.setAttribute("aria-expanded","false");}});
    return picker;
  }


  async function api(path, method = "GET", body) {
    const auth = token(), id = businessId();
    if (!auth) throw new Error("برای استفاده از دفتر مالی ابتدا وارد حساب نوا شو.");
    if (!id) throw new Error("ابتدا پرونده کسب‌وکار را انتخاب کن.");
    const response = await fetch(API + "/" + encodeURIComponent(id) + path, {
      method,
      headers: { Authorization: "Bearer " + auth, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || "عملیات دفتر مالی انجام نشد.");
    return data;
  }
  function say(id, message, bad = false) {
    const node = $(id); if (!node) return;
    node.textContent = message; node.dataset.state = bad ? "error" : "ok";
  }
  function cell(row, value) {
    const td = document.createElement("td"); td.textContent = value; row.append(td); return td;
  }
  function option(select, value, label) {
    const item = document.createElement("option"); item.value = value; item.textContent = label; select.append(item);
  }
  function renderSuppliers() {
    const body = $("bizSupplierRows"); if (!body) return;
    body.replaceChildren();
    if (!suppliers.length) { const tr=document.createElement("tr"); const td=cell(tr,"هنوز تأمین‌کننده‌ای ثبت نشده است."); td.colSpan=4; body.append(tr); return; }
    for (const item of suppliers) {
      const tr=document.createElement("tr");
      cell(tr,item.name); cell(tr,money(item.purchasesToman)); cell(tr,money(item.paidToman)); cell(tr,money(item.balanceToman));
      body.append(tr);
    }
  }
  function renderAccounts() {
    const body=$("bizCashAccountRows"); if(body){body.replaceChildren();for(const a of accounts){const tr=document.createElement("tr");cell(tr,a.name);cell(tr,a.accountType==="cash"?"صندوق":a.accountType==="bank"?"بانک":a.accountType==="card"?"کارت":"سایر");cell(tr,money(a.balanceToman));cell(tr,a.status==="active"?"فعال":"بایگانی");body.append(tr);}} 
    for (const id of ["bizLedgerCashAccount","bizLedgerMovementAccount","bizPurchaseCashAccount"]) {
      const select=$(id); if(!select)continue; const selected=select.value;select.replaceChildren();option(select,"","انتخاب حساب");accounts.filter(a=>a.status==="active").forEach(a=>option(select,a.id,a.name+" — "+money(a.balanceToman)));if(accounts.some(a=>a.id===selected))select.value=selected;
    }
  }
  function renderExpenses() {
    const select=$("bizExpensePaymentTransaction");if(!select)return;
    const selected=select.value;select.replaceChildren();option(select,"","انتخاب هزینه ثبت‌شده");
    expenses.forEach(e=>option(select,e.id,e.title+" — "+money(e.amountToman)+" — "+formatPersianDate(e.transactionDate)));
    if(expenses.some(e=>e.id===selected))select.value=selected;
  }
  function renderSuppliersSelect() {
    const select=$("bizExpensePaymentSupplier");if(!select)return;
    const selected=select.value;select.replaceChildren();option(select,"","بدون اتصال به تأمین‌کننده");
    suppliers.filter(s=>s.status==="active").forEach(s=>option(select,s.id,s.name));
    if(suppliers.some(s=>s.id===selected))select.value=selected;
  }
  function renderPurchaseOptions() {
    const supplierSelect=$("bizPurchaseSupplier"),itemSelect=$("bizPurchaseItem");
    if(supplierSelect){const selected=supplierSelect.value;supplierSelect.replaceChildren();option(supplierSelect,"","انتخاب تأمین‌کننده");suppliers.filter(x=>x.status==="active").forEach(x=>option(supplierSelect,x.id,x.name));if(suppliers.some(x=>x.id===selected&&x.status==="active"))supplierSelect.value=selected;}
    if(itemSelect){const selected=itemSelect.value;itemSelect.replaceChildren();option(itemSelect,"","انتخاب محصول دارای کنترل موجودی");inventoryItems.forEach(x=>option(itemSelect,x.id,x.name+" — واحد: "+x.unit));if(inventoryItems.some(x=>x.id===selected))itemSelect.value=selected;}
  }
  function renderPurchases() {
    const body=$("bizPurchaseRows");if(!body)return;body.replaceChildren();
    if(!purchases.length){const tr=document.createElement("tr");const td=cell(tr,"هنوز خریدی ثبت نشده است.");td.colSpan=7;body.append(tr);return;}
    for(const p of purchases){const tr=document.createElement("tr");cell(tr,formatPersianDate(p.purchaseDate));cell(tr,p.itemName);cell(tr,p.supplierName);cell(tr,Number(p.quantity).toLocaleString("fa-IR"));cell(tr,money(p.totalToman));cell(tr,money(p.paidToman));cell(tr,money(p.balanceToman));body.append(tr);}
  }
  function updatePurchaseTotal() {
    const quantity=Number(digits($("bizPurchaseQuantity")?.value||"").replace(/[٬,\s]/g,""));
    const price=Number(digits($("bizPurchaseUnitPrice")?.value||"").replace(/[٬,\s]/g,""));
    const total=quantity>0&&price>0&&Number.isSafeInteger(quantity*price)?quantity*price:0;
    const node=$("bizPurchaseTotal");if(node)node.textContent="جمع خرید: "+money(total);
  }
  function renderMovements(rows) {
    const body=$("bizCashMovementRows");if(!body)return;body.replaceChildren();
    if(!rows.length){const tr=document.createElement("tr");const td=cell(tr,"هنوز گردش مالی ثبت نشده است.");td.colSpan=6;body.append(tr);return;}
    for(const m of rows){
      const tr=document.createElement("tr");
      cell(tr,formatPersianDate(m.movementDate));
      cell(tr,m.title|| (m.sourceType==="customer_receipt"?"دریافت مشتری":m.sourceType==="expense_payment"?"پرداخت هزینه":m.direction==="in"?"ورودی دستی":"خروجی دستی"));
      cell(tr,m.direction==="in"?"ورودی":"خروجی");
      cell(tr,money(m.amountToman));
      cell(tr,m.status==="active"?"فعال":"باطل‌شده");
      const action=cell(tr,"");
      const canVoid=m.status==="active"&&(m.sourceType==="expense_payment"||m.sourceType==="manual_inflow"||m.sourceType==="manual_outflow");
      if(canVoid){
        const button=document.createElement("button");
        button.type="button";
        button.className="biz-payment-void";
        button.textContent=m.sourceType==="expense_payment"?"ابطال پرداخت":"ابطال گردش";
        button.addEventListener("click",async()=>{
          const isPayment=m.sourceType==="expense_payment";
          const message=isPayment
            ?"پرداخت هزینه باطل شود؟ مبلغ به حساب مالی برمی‌گردد و مانده بدهی دوباره محاسبه می‌شود."
            :"این گردش دستی باطل شود؟ مانده حساب مالی به‌روزرسانی می‌شود.";
          if(!await window.navaConfirm(message,{title:isPayment?"ابطال پرداخت هزینه":"ابطال گردش دستی",confirmText:"ابطال"}))return;
          button.disabled=true;
          try{
            const endpoint=isPayment
              ?"/expense-payments/"+encodeURIComponent(m.sourceId)+"/void"
              :"/cash-movements/"+encodeURIComponent(m.id)+"/void";
            await api(endpoint,"POST",{});
            await load();
            say("bizLedgerStatus",isPayment?"پرداخت باطل شد و مانده حساب اصلاح شد.":"گردش دستی باطل شد و مانده حساب اصلاح شد.");
          }catch(error){say("bizLedgerStatus",error.message,true);button.disabled=false;}
        });
        action.append(button);
      }else action.textContent="—";
      body.append(tr);
    }
  }
  async function load() {
    if (!businessId()) return;
    try {
      const [s,a,t,m,inventory,purchaseData] = await Promise.all([
        api("/suppliers"), api("/cash-accounts"), api("/transactions?limit=500"), api("/cash-movements?limit=150"),
        api("/inventory"), api("/purchases")
      ]);
      suppliers=s.suppliers||[];accounts=a.accounts||[];inventoryItems=inventory.items||[];purchases=purchaseData.purchases||[];
      expenses=(t.transactions||[]).filter(x=>x.transactionType==="expense");
      renderSuppliers();renderAccounts();renderExpenses();renderSuppliersSelect();renderPurchaseOptions();renderPurchases();renderMovements(m.movements||[]);
      say("bizLedgerStatus","اطلاعات تأمین‌کنندگان، حساب‌ها و گردش مالی به‌روز شد.");
    } catch(error){say("bizLedgerStatus",error.message,true);}
  }
  const cashMovementDatePicker=setupPersianDatePicker("bizCashMovementDate");
  const expensePaymentDatePicker=setupPersianDatePicker("bizExpensePaymentDate");
  const purchaseDatePicker=setupPersianDatePicker("bizPurchaseDate");
  $("bizPurchaseForm")?.addEventListener("submit",async event=>{
    event.preventDefault();const button=$("bizPurchaseSubmit");button.disabled=true;
    try{
      const quantity=Number(digits($("bizPurchaseQuantity").value).replace(/[٬,\s]/g,""));
      const unitPriceToman=Number(digits($("bizPurchaseUnitPrice").value).replace(/[٬,\s]/g,""));
      const paidAmountToman=Number(digits($("bizPurchasePaidAmount").value||"0").replace(/[٬,\s]/g,""));
      if(!Number.isSafeInteger(quantity)||quantity<1||!Number.isSafeInteger(unitPriceToman)||unitPriceToman<1)throw new Error("تعداد و قیمت واحد خرید را به‌درستی وارد کن.");
      if(!Number.isSafeInteger(paidAmountToman)||paidAmountToman<0)throw new Error("مبلغ پرداخت‌شده معتبر نیست.");
      const total=quantity*unitPriceToman;if(!Number.isSafeInteger(total)||total>1000000000000)throw new Error("مبلغ کل خرید از سقف مجاز بیشتر است.");
      if(paidAmountToman>total)throw new Error("پرداخت اولیه نمی‌تواند از مبلغ کل خرید بیشتر باشد.");
      if(paidAmountToman>0&&!$("bizPurchaseCashAccount").value)throw new Error("برای ثبت پرداخت، حساب مالی را انتخاب کن.");
      await api("/purchases","POST",{
        supplierId:$("bizPurchaseSupplier").value,itemId:$("bizPurchaseItem").value,quantity,unitPriceToman,
        purchaseDate:$("bizPurchaseDate").value,paidAmountToman,cashAccountId:$("bizPurchaseCashAccount").value||null,
        paymentMethod:$("bizPurchasePaymentMethod").value,reference:$("bizPurchaseReference").value.trim(),notes:$("bizPurchaseNotes").value.trim()
      });
      $("bizPurchaseForm").reset();$("bizPurchasePaidAmount").value="0";purchaseDatePicker.set(today());updatePurchaseTotal();
      window.dispatchEvent(new CustomEvent("nava:business-purchase-updated"));
      await load();say("bizPurchaseStatus","خرید ثبت شد؛ موجودی انبار افزایش یافت و بدهی و پرداخت در دفتر مالی به‌روزرسانی شد.");
    }catch(error){say("bizPurchaseStatus",error.message,true);}finally{button.disabled=false;}
  });
  for(const id of ["bizPurchaseQuantity","bizPurchaseUnitPrice"])$(id)?.addEventListener("input",event=>{event.target.value=digits(event.target.value);updatePurchaseTotal();});
  $("bizPurchasePaidAmount")?.addEventListener("input",event=>{event.target.value=digits(event.target.value);});
  $("bizSupplierForm")?.addEventListener("submit",async event=>{
    event.preventDefault();const button=$("bizSupplierSubmit");button.disabled=true;
    try{await api("/suppliers","POST",{name:$("bizSupplierName").value.trim(),phone:$("bizSupplierPhone").value.trim()});$("bizSupplierForm").reset();window.dispatchEvent(new CustomEvent("nava:business-suppliers-updated"));await load();say("bizSupplierStatus","تأمین‌کننده ثبت شد.");}
    catch(error){say("bizSupplierStatus",error.message,true);}finally{button.disabled=false;}
  });
  $("bizCashAccountForm")?.addEventListener("submit",async event=>{
    event.preventDefault();const button=$("bizCashAccountSubmit");button.disabled=true;
    try{const amount=Number(digits($("bizCashOpening").value)||0);if(!Number.isSafeInteger(amount)||amount<0)throw new Error("موجودی افتتاحیه معتبر نیست.");await api("/cash-accounts","POST",{name:$("bizCashAccountName").value.trim(),accountType:$("bizCashAccountType").value,openingBalanceToman:amount});$("bizCashAccountForm").reset();$("bizCashOpening").value="0";await load();say("bizCashAccountStatus","حساب مالی ثبت شد.");}
    catch(error){say("bizCashAccountStatus",error.message,true);}finally{button.disabled=false;}
  });
  $("bizCashMovementForm")?.addEventListener("submit",async event=>{
    event.preventDefault();const button=$("bizCashMovementSubmit");button.disabled=true;
    try{const amount=Number(digits($("bizCashMovementAmount").value));if(!Number.isSafeInteger(amount)||amount<1)throw new Error("مبلغ گردش معتبر نیست.");await api("/cash-movements","POST",{cashAccountId:$("bizLedgerMovementAccount").value,direction:$("bizCashMovementDirection").value,amountToman:amount,movementDate:$("bizCashMovementDate").value,title:$("bizCashMovementTitle").value.trim(),method:$("bizCashMovementMethod").value,reference:$("bizCashMovementReference").value.trim(),notes:$("bizCashMovementNotes").value.trim()});$("bizCashMovementForm").reset();cashMovementDatePicker.set(today());await load();say("bizCashMovementStatus","گردش مالی ثبت شد.");}
    catch(error){say("bizCashMovementStatus",error.message,true);}finally{button.disabled=false;}
  });
  $("bizExpensePaymentForm")?.addEventListener("submit",async event=>{
    event.preventDefault();const button=$("bizExpensePaymentSubmit");button.disabled=true;
    try{const amount=Number(digits($("bizExpensePaymentAmount").value));if(!Number.isSafeInteger(amount)||amount<1)throw new Error("مبلغ پرداخت معتبر نیست.");await api("/expense-payments","POST",{transactionId:$("bizExpensePaymentTransaction").value,supplierId:$("bizExpensePaymentSupplier").value||null,cashAccountId:$("bizLedgerCashAccount").value,amountToman:amount,paymentDate:$("bizExpensePaymentDate").value,paymentMethod:$("bizExpensePaymentMethod").value,reference:$("bizExpensePaymentReference").value.trim(),notes:$("bizExpensePaymentNotes").value.trim()});$("bizExpensePaymentForm").reset();expensePaymentDatePicker.set(today());await load();say("bizExpensePaymentStatus","پرداخت هزینه ثبت شد و از موجودی حساب مالی کسر شد.");}
    catch(error){say("bizExpensePaymentStatus",error.message,true);}finally{button.disabled=false;}
  });
  for(const id of ["bizCashOpening","bizCashMovementAmount","bizExpensePaymentAmount"])$(id)?.addEventListener("input",event=>{event.target.value=digits(event.target.value);});
  $("bizProfileSelect")?.addEventListener("change",load);
  window.addEventListener("nava:business-selection-changed",load);
  window.addEventListener("nava:business-auth-changed",load);
  cashMovementDatePicker.set(today());expensePaymentDatePicker.set(today());purchaseDatePicker.set(today());$("bizCashOpening").value="0";$("bizPurchasePaidAmount").value="0";updatePurchaseTotal();
  load();
})();
