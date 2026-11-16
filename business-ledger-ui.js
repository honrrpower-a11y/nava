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
  let suppliers = [], accounts = [], expenses = [];

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
    for (const id of ["bizLedgerCashAccount","bizLedgerMovementAccount"]) {
      const select=$(id); if(!select)continue; const selected=select.value;select.replaceChildren();option(select,"","انتخاب حساب");accounts.filter(a=>a.status==="active").forEach(a=>option(select,a.id,a.name+" — "+money(a.balanceToman)));if(accounts.some(a=>a.id===selected))select.value=selected;
    }
  }
  function renderExpenses() {
    const select=$("bizExpensePaymentTransaction");if(!select)return;
    const selected=select.value;select.replaceChildren();option(select,"","انتخاب هزینه ثبت‌شده");
    expenses.forEach(e=>option(select,e.id,e.title+" — "+money(e.amountToman)+" — "+e.transactionDate));
    if(expenses.some(e=>e.id===selected))select.value=selected;
  }
  function renderSuppliersSelect() {
    const select=$("bizExpensePaymentSupplier");if(!select)return;
    const selected=select.value;select.replaceChildren();option(select,"","بدون اتصال به تأمین‌کننده");
    suppliers.filter(s=>s.status==="active").forEach(s=>option(select,s.id,s.name));
    if(suppliers.some(s=>s.id===selected))select.value=selected;
  }
  function renderMovements(rows) {
    const body=$("bizCashMovementRows");if(!body)return;body.replaceChildren();
    if(!rows.length){const tr=document.createElement("tr");const td=cell(tr,"هنوز گردش مالی ثبت نشده است.");td.colSpan=5;body.append(tr);return;}
    for(const m of rows){const tr=document.createElement("tr");cell(tr,m.movementDate);cell(tr,m.title|| (m.sourceType==="customer_receipt"?"دریافت مشتری":m.sourceType==="expense_payment"?"پرداخت هزینه":m.direction==="in"?"ورودی دستی":"خروجی دستی"));cell(tr,m.direction==="in"?"ورودی":"خروجی");cell(tr,money(m.amountToman));cell(tr,m.status==="active"?"فعال":"باطل‌شده");body.append(tr);}
  }
  async function load() {
    if (!businessId()) return;
    try {
      const [s,a,t,m] = await Promise.all([
        api("/suppliers"), api("/cash-accounts"), api("/transactions?limit=500"), api("/cash-movements?limit=150")
      ]);
      suppliers=s.suppliers||[];accounts=a.accounts||[];
      expenses=(t.transactions||[]).filter(x=>x.transactionType==="expense");
      renderSuppliers();renderAccounts();renderExpenses();renderSuppliersSelect();renderMovements(m.movements||[]);
      say("bizLedgerStatus","اطلاعات تأمین‌کنندگان، حساب‌ها و گردش مالی به‌روز شد.");
    } catch(error){say("bizLedgerStatus",error.message,true);}
  }
  $("bizSupplierForm")?.addEventListener("submit",async event=>{
    event.preventDefault();const button=$("bizSupplierSubmit");button.disabled=true;
    try{await api("/suppliers","POST",{name:$("bizSupplierName").value.trim(),phone:$("bizSupplierPhone").value.trim()});$("bizSupplierForm").reset();await load();say("bizSupplierStatus","تأمین‌کننده ثبت شد.");}
    catch(error){say("bizSupplierStatus",error.message,true);}finally{button.disabled=false;}
  });
  $("bizCashAccountForm")?.addEventListener("submit",async event=>{
    event.preventDefault();const button=$("bizCashAccountSubmit");button.disabled=true;
    try{const amount=Number(digits($("bizCashOpening").value)||0);if(!Number.isSafeInteger(amount)||amount<0)throw new Error("موجودی افتتاحیه معتبر نیست.");await api("/cash-accounts","POST",{name:$("bizCashAccountName").value.trim(),accountType:$("bizCashAccountType").value,openingBalanceToman:amount});$("bizCashAccountForm").reset();$("bizCashOpening").value="0";await load();say("bizCashAccountStatus","حساب مالی ثبت شد.");}
    catch(error){say("bizCashAccountStatus",error.message,true);}finally{button.disabled=false;}
  });
  $("bizCashMovementForm")?.addEventListener("submit",async event=>{
    event.preventDefault();const button=$("bizCashMovementSubmit");button.disabled=true;
    try{const amount=Number(digits($("bizCashMovementAmount").value));if(!Number.isSafeInteger(amount)||amount<1)throw new Error("مبلغ گردش معتبر نیست.");await api("/cash-movements","POST",{cashAccountId:$("bizLedgerMovementAccount").value,direction:$("bizCashMovementDirection").value,amountToman:amount,movementDate:$("bizCashMovementDate").value,title:$("bizCashMovementTitle").value.trim(),method:$("bizCashMovementMethod").value,reference:$("bizCashMovementReference").value.trim(),notes:$("bizCashMovementNotes").value.trim()});$("bizCashMovementForm").reset();$("bizCashMovementDate").value=today();await load();say("bizCashMovementStatus","گردش مالی ثبت شد.");}
    catch(error){say("bizCashMovementStatus",error.message,true);}finally{button.disabled=false;}
  });
  $("bizExpensePaymentForm")?.addEventListener("submit",async event=>{
    event.preventDefault();const button=$("bizExpensePaymentSubmit");button.disabled=true;
    try{const amount=Number(digits($("bizExpensePaymentAmount").value));if(!Number.isSafeInteger(amount)||amount<1)throw new Error("مبلغ پرداخت معتبر نیست.");await api("/expense-payments","POST",{transactionId:$("bizExpensePaymentTransaction").value,supplierId:$("bizExpensePaymentSupplier").value||null,cashAccountId:$("bizLedgerCashAccount").value,amountToman:amount,paymentDate:$("bizExpensePaymentDate").value,paymentMethod:$("bizExpensePaymentMethod").value,reference:$("bizExpensePaymentReference").value.trim(),notes:$("bizExpensePaymentNotes").value.trim()});$("bizExpensePaymentForm").reset();$("bizExpensePaymentDate").value=today();await load();say("bizExpensePaymentStatus","پرداخت هزینه ثبت شد و از موجودی حساب مالی کسر شد.");}
    catch(error){say("bizExpensePaymentStatus",error.message,true);}finally{button.disabled=false;}
  });
  for(const id of ["bizCashOpening","bizCashMovementAmount","bizExpensePaymentAmount"])$(id)?.addEventListener("input",event=>{event.target.value=digits(event.target.value);});
  $("bizProfileSelect")?.addEventListener("change",load);
  window.addEventListener("nava:business-selection-changed",load);
  window.addEventListener("nava:business-auth-changed",load);
  $("bizCashMovementDate").value=today();$("bizExpensePaymentDate").value=today();$("bizCashOpening").value="0";
  load();
})();
