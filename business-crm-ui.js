/* NAVA BUSINESS — customer and order workspace. */
(() => {
 "use strict";
 const $=id=>document.getElementById(id), root=$("bizPage");
 if(!root||!$("bizCustomerForm")||!$("bizOrderForm"))return;
 const API="https://nava-music-api.honrrpower.workers.dev/businesses";
 const ACTIVE="nava_business_active_id",SESSION="nava_navi_session",EXPIRY="nava_navi_expiry";
 let customers=[],catalog=[],orders=[],busy=false;
 const digits=v=>String(v??"").replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬,،\s]/g,"");
 const int=v=>/^\d+$/.test(digits(v))&&Number.isSafeInteger(Number(digits(v)))?Number(digits(v)):null;
 const money=v=>Number(v||0).toLocaleString("fa-IR")+" تومان";
 const businessId=()=> $("bizProfileSelect")?.value||localStorage.getItem(ACTIVE)||"";
 const token=()=>{try{return Number(localStorage.getItem(EXPIRY)||0)>Date.now()?localStorage.getItem(SESSION)||"":""}catch{return""}};
 async function api(path,method="GET",body){
  const t=token();if(!t)throw Error("برای مدیریت مشتریان و سفارش‌ها ابتدا وارد حساب نوا شو.");
  const r=await fetch(API+"/"+encodeURIComponent(businessId())+path,{method,headers:{Authorization:"Bearer "+t,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const d=await r.json().catch(()=>({}));if(!r.ok||!d.success)throw Error(d.error||"درخواست انجام نشد.");return d;
 }
 const status=(id,msg,bad=false)=>{const n=$(id);if(n){n.textContent=msg;n.dataset.state=bad?"error":"success"}};
 function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;}
 function renderCustomers(){
  const list=$("bizCustomerList");list.replaceChildren();
  const opts=$("bizOrderCustomer");opts.replaceChildren(el("option","", "بدون اتصال به مشتری"));opts.firstChild.value="";
  customers.filter(c=>c.status==="active").forEach(c=>{const o=el("option","",c.name+(c.phone?" — "+c.phone:""));o.value=c.id;opts.append(o)});
  if(!customers.length){list.append(el("p","biz-crm-empty","هنوز مشتری‌ای ثبت نشده است."));return;}
  customers.forEach(c=>{
   const card=el("article","biz-crm-card"),main=el("div","biz-crm-card-main");
   main.append(el("strong","",c.name),el("small","",[c.phone,c.email].filter(Boolean).join(" · ")||"اطلاعات تماس ثبت نشده"));
   if(c.address)main.append(el("p","",c.address));card.append(main);
   if(c.status==="active"){
    const actions=el("div","biz-crm-actions"),edit=el("button","","ویرایش"),archive=el("button","","بایگانی");
    edit.type=archive.type="button";edit.addEventListener("click",()=>{ $("bizCustomerId").value=c.id;$("bizCustomerName").value=c.name;$("bizCustomerPhone").value=c.phone;$("bizCustomerEmail").value=c.email;$("bizCustomerAddress").value=c.address;$("bizCustomerNotes").value=c.notes;$("bizCustomerSubmit").textContent="ذخیره تغییرات";$("bizCustomerCancel").hidden=false; $("bizCustomerName").focus();});
    archive.addEventListener("click",async()=>{if(!await window.navaConfirm("مشتری بایگانی شود؟ سوابق سفارش او حفظ می‌شود.",{title:"بایگانی مشتری",confirmText:"بایگانی"}))return;archive.disabled=true;try{await api("/customers/"+encodeURIComponent(c.id),"DELETE");await load();status("bizCustomerStatus","مشتری بایگانی شد.")}catch(e){status("bizCustomerStatus",e.message,true);archive.disabled=false}});
    actions.append(edit,archive);card.append(actions);
   }
   list.append(card);
  });
 }
 function resetCustomer(){ $("bizCustomerForm").reset();$("bizCustomerId").value="";$("bizCustomerSubmit").textContent="ثبت مشتری";$("bizCustomerCancel").hidden=true;}
 function refreshOrderCatalogOptions(){
  $("bizOrderLines").querySelectorAll(".biz-order-line").forEach(row=>{
   const select=row.querySelector(".biz-order-catalog"),previous=select.value;
   select.replaceChildren(el("option","","ورود دستی / انتخاب از کاتالوگ"));select.options[0].value="";
   catalog.filter(x=>x.status==="active").forEach(x=>{const o=el("option","",x.name+" — "+money(x.salePriceToman));o.value=x.id;select.append(o)});
   select.value=previous;
  });
 }
 function todayIso(){const d=new Date();return[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
 const dateInput=$("bizOrderDate"),dateDisplay=$("bizOrderDateDisplay"),calendar=$("bizOrderCalendar"),calendarToggle=$("bizOrderCalendarToggle"),calendarMonthLabel=$("bizOrderCalendarMonth"),calendarDays=$("bizOrderCalendarDays");
 const persianPartsFormatter=new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn",{year:"numeric",month:"numeric",day:"numeric",timeZone:"UTC"});
 const persianDateFormatter=new Intl.DateTimeFormat("fa-IR-u-ca-persian",{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"});
 const persianMonthFormatter=new Intl.DateTimeFormat("fa-IR-u-ca-persian",{year:"numeric",month:"long",timeZone:"UTC"});
 let calendarYear=0,calendarMonth=0;
 function utcDate(iso){const [y,m,d]=String(iso).split("-").map(Number);return new Date(Date.UTC(y,m-1,d))}
 function persianParts(iso){const out={};for(const p of persianPartsFormatter.formatToParts(utcDate(iso)))if(p.type!=="literal")out[p.type]=Number(p.value);return{year:out.year,month:out.month,day:out.day}}
 function formatPersianDate(iso){return iso?persianDateFormatter.format(utcDate(iso)):""}
 function findPersianMonthDates(year,month){
  const matches=[],start=Date.UTC(year+621,0,1),end=Date.UTC(year+623,0,1);
  for(let time=start;time<end;time+=86400000){const d=new Date(time),iso=d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0"),p=persianParts(iso);if(p.year===year&&p.month===month)matches.push({iso,day:p.day,weekday:(d.getUTCDay()+1)%7})}
  return matches;
 }
 function setOrderDate(iso){if(!dateInput||!dateDisplay)return;dateInput.value=iso;dateDisplay.value=formatPersianDate(iso);const p=persianParts(iso);calendarYear=p.year;calendarMonth=p.month}
 function showOrderCalendar(open){if(!calendar||!calendarToggle)return;calendar.hidden=!open;calendarToggle.setAttribute("aria-expanded",String(open));if(open)renderOrderCalendar()}
 function renderOrderCalendar(){
  if(!calendarDays||!calendarMonthLabel)return;const dates=findPersianMonthDates(calendarYear,calendarMonth);if(!dates.length)return;
  calendarMonthLabel.textContent=persianMonthFormatter.format(utcDate(dates[0].iso));calendarDays.replaceChildren();
  for(let i=0;i<dates[0].weekday;i++){const blank=el("span","biz-calendar-empty");calendarDays.append(blank)}
  for(const d of dates){const b=el("button","",d.day.toLocaleString("fa-IR"));b.type="button";b.dataset.date=d.iso;if(d.iso===dateInput.value){b.classList.add("is-selected");b.setAttribute("aria-pressed","true")}b.addEventListener("click",()=>{setOrderDate(d.iso);showOrderCalendar(false)});calendarDays.append(b)}
 }
 function moveOrderCalendar(delta){calendarMonth+=delta;if(calendarMonth<1){calendarMonth=12;calendarYear--}if(calendarMonth>12){calendarMonth=1;calendarYear++}renderOrderCalendar()}
 calendarToggle?.addEventListener("click",()=>{if(!dateInput.value)setOrderDate(todayIso());if(calendar.hidden){const p=persianParts(dateInput.value);calendarYear=p.year;calendarMonth=p.month}showOrderCalendar(calendar.hidden)});
 $("bizOrderCalendarPrev")?.addEventListener("click",()=>moveOrderCalendar(-1));$("bizOrderCalendarNext")?.addEventListener("click",()=>moveOrderCalendar(1));
 document.addEventListener("click",e=>{if(calendar&&!calendar.hidden&&!calendar.contains(e.target)&&!calendarToggle?.contains(e.target)&&!dateDisplay?.contains(e.target))showOrderCalendar(false)});
 function addOrderRow(itemId="",name="",qty="1",price=""){
  const row=el("div","biz-order-line");row.dataset.catalogId=itemId;
  const select=el("select","biz-order-catalog");select.append(el("option","","ورود دستی / انتخاب از کاتالوگ"));select.options[0].value="";
  catalog.filter(x=>x.status==="active").forEach(x=>{const o=el("option","",x.name+" — "+money(x.salePriceToman));o.value=x.id;select.append(o)});
  select.value=itemId;
  const title=el("input","biz-order-title");title.placeholder="نام کالا یا خدمت";title.maxLength=140;title.value=name;
  const quantity=el("input","biz-order-qty");quantity.inputMode="numeric";quantity.placeholder="تعداد";quantity.value=qty;
  const unit=el("input","biz-order-price");unit.inputMode="numeric";unit.placeholder="قیمت واحد (تومان)";unit.value=price;
  const remove=el("button","biz-order-remove","×");remove.type="button";remove.setAttribute("aria-label","حذف ردیف");
  select.addEventListener("change",()=>{const item=catalog.find(x=>x.id===select.value);row.dataset.catalogId=select.value;if(item){title.value=item.name;unit.value=String(item.salePriceToman)}recalcOrder()});
  [title,quantity,unit].forEach(n=>n.addEventListener("input",recalcOrder));
  remove.addEventListener("click",()=>{row.remove();recalcOrder()});
  row.append(select,title,quantity,unit,remove);$("bizOrderLines").append(row);recalcOrder();
 }
 function recalcOrder(){
  let total=0,valid=true;
  $("bizOrderLines").querySelectorAll(".biz-order-line").forEach(row=>{const q=int(row.querySelector(".biz-order-qty").value),p=int(row.querySelector(".biz-order-price").value);if(!q||!p){valid=false;return}const sum=q*p;if(!Number.isSafeInteger(sum)){valid=false;return}total+=sum;if(!Number.isSafeInteger(total))valid=false});
  $("bizOrderTotal").textContent=money(valid?total:0);$("bizOrderSubmit").disabled=!valid||!$("bizOrderLines").children.length||busy;
 }
 function readOrder(){
  return [...$("bizOrderLines").querySelectorAll(".biz-order-line")].map(row=>({catalogItemId:row.querySelector(".biz-order-catalog").value||null,itemName:row.querySelector(".biz-order-title").value.trim(),quantity:int(row.querySelector(".biz-order-qty").value),unitPriceToman:int(row.querySelector(".biz-order-price").value)}));
 }
 function renderOrders(){
  const list=$("bizOrderList");list.replaceChildren();
  if(!orders.length){list.append(el("p","biz-crm-empty","هنوز سفارشی ثبت نشده است."));return}
  const labels={draft:"پیش‌نویس",confirmed:"تأیید و تبدیل به فروش",cancelled:"لغوشده"};
  orders.forEach(o=>{
   const card=el("article","biz-order-card"),head=el("div","biz-order-card-head");
   head.append(el("strong","",o.customerName||"مشتری ثبت‌نشده"),el("span","biz-order-status",labels[o.status]||o.status));card.append(head);
   card.append(el("small","", "تاریخ: "+formatPersianDate(o.orderDate)+" · "+o.items.length+" ردیف"));
   const lines=el("div","biz-order-lines-view");o.items.forEach(x=>lines.append(el("div","",x.itemName+" × "+x.quantity.toLocaleString("fa-IR")+" — "+money(x.lineTotalToman))));card.append(lines);
   card.append(el("strong","biz-order-total","جمع سفارش: "+money(o.totalToman)));
   if(o.notes)card.append(el("p","biz-order-notes",o.notes));
   if(o.status==="draft"){
    const actions=el("div","biz-crm-actions"),confirmBtn=el("button","","تأیید و ثبت فروش"),cancelBtn=el("button","","لغو سفارش");
    confirmBtn.type=cancelBtn.type="button";
    confirmBtn.addEventListener("click",async()=>{status("bizOrderStatus","در حال آماده‌سازی تأیید سفارش…");try{const approved=typeof window.navaConfirm==="function"?await window.navaConfirm("سفارش تأیید و به فروش واقعی تبدیل شود؟ موجودی محصولات انباردار در همین مرحله کسر می‌شود.",{title:"تأیید و ثبت فروش",confirmText:"تأیید فروش"}):window.confirm("سفارش تأیید و به فروش واقعی تبدیل شود؟ موجودی محصولات انباردار در همین مرحله کسر می‌شود.");if(!approved){status("bizOrderStatus","تأیید سفارش لغو شد.");return}confirmBtn.disabled=true;status("bizOrderStatus","در حال ثبت فروش و به‌روزرسانی موجودی…");await api("/orders/"+encodeURIComponent(o.id)+"/confirm","POST",{});status("bizOrderStatus","سفارش تأیید شد؛ فروش در دفتر مالی ثبت و موجودی انبار به‌روزرسانی شد.");await load();window.dispatchEvent(new CustomEvent("nava:business-order-updated"));}catch(e){status("bizOrderStatus",e.message||"تأیید سفارش انجام نشد.",true);confirmBtn.disabled=false}});
    cancelBtn.addEventListener("click",async()=>{if(!await window.navaConfirm("این پیش‌نویس لغو شود؟",{title:"لغو سفارش",confirmText:"لغو سفارش",danger:true}))return;cancelBtn.disabled=true;try{await api("/orders/"+encodeURIComponent(o.id),"DELETE");await load()}catch(e){status("bizOrderStatus",e.message,true);cancelBtn.disabled=false}});
    actions.append(confirmBtn,cancelBtn);card.append(actions);
   }
   list.append(card);
  });
 }
 async function load(){
  const id=businessId();if(!id){customers=[];catalog=[];orders=[];renderCustomers();renderOrders();status("bizCustomerStatus","ابتدا یک پرونده کسب‌وکار انتخاب کن.",true);return}
  try{
   const [c,i,o]=await Promise.all([api("/customers?status=all"),api("/items?status=active"),api("/orders?status=all")]);
   customers=c.customers||[];catalog=i.items||[];orders=o.orders||[];
   renderCustomers();renderOrders();
   const orderLines=$("bizOrderLines");if(!orderLines.children.length)addOrderRow();else refreshOrderCatalogOptions();
   status("bizCustomerStatus","مشتریان پرونده بارگذاری شدند.");status("bizOrderStatus","سفارش‌ها و وضعیت آن‌ها بارگذاری شدند.");
  }catch(e){status("bizCustomerStatus",e.message,true);status("bizOrderStatus",e.message,true)}
 }
 $("bizCustomerForm").addEventListener("submit",async e=>{
  e.preventDefault();if(busy)return;const id=$("bizCustomerId").value;
  const body={name:$("bizCustomerName").value.trim(),phone:$("bizCustomerPhone").value.trim(),email:$("bizCustomerEmail").value.trim(),address:$("bizCustomerAddress").value.trim(),notes:$("bizCustomerNotes").value.trim()};
  busy=true;$("bizCustomerSubmit").disabled=true;
  try{await api("/customers"+(id?"/"+encodeURIComponent(id):""),id?"PATCH":"POST",body);resetCustomer();await load();status("bizCustomerStatus",id?"اطلاعات مشتری ذخیره شد.":"مشتری جدید ثبت شد.");}
  catch(e){status("bizCustomerStatus",e.message,true)}
  finally{busy=false;$("bizCustomerSubmit").disabled=false}
 });
 $("bizCustomerCancel").addEventListener("click",resetCustomer);
 $("bizOrderAddLine").addEventListener("click",()=>addOrderRow());
 $("bizOrderForm").addEventListener("submit",async e=>{
  e.preventDefault();if(busy)return;
  const items=readOrder();if(items.some(x=>!x.itemName||!x.quantity||!x.unitPriceToman)){status("bizOrderStatus","نام، تعداد و قیمت همه ردیف‌ها را کامل کن.",true);return}
  const date=dateInput.value;if(!date){status("bizOrderStatus","تاریخ سفارش را انتخاب کن.",true);return}
  busy=true;$("bizOrderSubmit").disabled=true;
  try{await api("/orders","POST",{customerId:$("bizOrderCustomer").value||null,orderDate:date,notes:$("bizOrderNotes").value.trim(),items});$("bizOrderForm").reset();setOrderDate(todayIso());$("bizOrderLines").replaceChildren();addOrderRow();await load();status("bizOrderStatus","سفارش به‌صورت پیش‌نویس ذخیره شد؛ هنوز فروش یا کسر موجودی انجام نشده است.");}
  catch(e){status("bizOrderStatus",e.message,true)}
  finally{busy=false;recalcOrder()}
 });
 $("bizProfileSelect")?.addEventListener("change",()=>{resetCustomer();$("bizOrderLines").replaceChildren();load()});
 window.addEventListener("nava:business-selection-changed",()=>{resetCustomer();$("bizOrderLines").replaceChildren();load()});
 window.addEventListener("nava:business-auth-changed",load);
 window.addEventListener("nava:business-order-updated",load);
 window.addEventListener("focus",load);
 setOrderDate(todayIso());
 addOrderRow();load();
})();