// NAVA BUSINESS — proforma/invoice workspace and print-ready documents.
(() => {
 "use strict";
 const $=id=>document.getElementById(id),root=$("bizPage");
 if(!root||!$("bizInvoiceForm"))return;
 const API="https://nava-music-api.honrrpower.workers.dev/businesses";
 let orders=[],invoices=[],busy=false;
 const digits=v=>String(v??"").replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬,،\s]/g,"");
 const integer=v=>/^\d+$/.test(digits(v))&&Number.isSafeInteger(Number(digits(v)))?Number(digits(v)):0;
 const money=v=>Number(v||0).toLocaleString("fa-IR")+" تومان";
 const businessId=()=>$("bizProfileSelect")?.value||localStorage.getItem("nava_business_active_id")||"";
 const token=()=>{try{return Number(localStorage.getItem("nava_navi_expiry")||0)>Date.now()?localStorage.getItem("nava_navi_session")||"":""}catch{return""}};
 const say=(message,bad=false)=>{const n=$("bizInvoiceStatus");if(n){n.textContent=message;n.dataset.state=bad?"error":"success"}};
 async function api(path,method="GET",body){
  const t=token();if(!t)throw Error("برای صدور فاکتور ابتدا وارد حساب نوا شو.");
  const r=await fetch(API+"/"+encodeURIComponent(businessId())+path,{method,headers:{Authorization:"Bearer "+t,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const d=await r.json().catch(()=>({}));if(!r.ok||!d.success)throw Error(d.error||"درخواست انجام نشد.");return d;
 }
 const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
 const date=iso=>{if(!iso)return"—";const [y,m,d]=iso.split("-").map(Number);return new Intl.DateTimeFormat("fa-IR-u-ca-persian",{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,d)))};
 function renderOrderOptions(){
  const select=$("bizInvoiceOrder"),previous=select.value;select.replaceChildren(el("option","","انتخاب سفارش"));
  orders.filter(o=>o.status!=="cancelled").forEach(o=>{const label=(o.customerName||"مشتری آزاد")+" · "+date(o.orderDate)+" · "+money(o.totalToman)+" · "+(o.status==="confirmed"?"تأییدشده":"پیش‌نویس");const opt=el("option","",label);opt.value=o.id;select.append(opt)});
  if([...select.options].some(o=>o.value===previous))select.value=previous;
  syncDocumentType();
 }
 function syncDocumentType(){
  const order=orders.find(o=>o.id===$("bizInvoiceOrder").value),type=$("bizInvoiceType");
  const invoiceOption=[...type.options].find(o=>o.value==="invoice");
  if(invoiceOption)invoiceOption.disabled=!order||order.status!=="confirmed";
  if(type.value==="invoice"&&invoiceOption?.disabled)type.value="proforma";
  $("bizInvoiceOrderHint").textContent=order?.status==="confirmed"?"این سفارش تأیید شده و امکان صدور فاکتور نهایی دارد.":"برای سفارش پیش‌نویس فقط پیش‌فاکتور صادر می‌شود؛ فاکتور نهایی بعد از تأیید سفارش فعال خواهد شد.";
 }
 function renderInvoices(){
  const list=$("bizInvoiceList");list.replaceChildren();
  if(!invoices.length){list.append(el("p","biz-crm-empty","هنوز پیش‌فاکتور یا فاکتوری صادر نشده است."));return}
  const labels={invoice:"فاکتور نهایی",proforma:"پیش‌فاکتور"},pay={unpaid:"پرداخت‌نشده",partially_paid:"پرداخت‌جزئی",paid:"تسویه‌شده",voided:"باطل‌شده"};
  invoices.forEach(inv=>{
   const card=el("article","biz-order-card"),head=el("div","biz-order-card-head");
   head.append(el("strong","",inv.invoiceNumber+" · "+(labels[inv.documentType]||"سند فروش")),el("span","biz-order-status",pay[inv.paymentStatus]||inv.status));
   card.append(head,el("small","",date(inv.issueDate)+" · "+(inv.customerName||"مشتری آزاد")));
   card.append(el("strong","biz-order-total","مبلغ: "+money(inv.totalToman)));
   if(inv.documentType==="invoice")card.append(el("small","", "دریافتی: "+money(inv.paidToman)+" · مانده: "+money(inv.dueToman)));
   const actions=el("div","biz-crm-actions"),print=el("button","","چاپ / ذخیره PDF");print.type="button";print.addEventListener("click",()=>printInvoice(inv));
   actions.append(print);
   if(inv.status==="issued"&&inv.paidToman===0){const cancel=el("button","","ابطال سند");cancel.type="button";cancel.addEventListener("click",async()=>{if(!await window.navaConfirm("این سند باطل شود؟ سوابق آن حذف نخواهد شد.",{title:"ابطال سند",confirmText:"ابطال",danger:true}))return;cancel.disabled=true;try{await api("/invoices/"+encodeURIComponent(inv.id)+"/void","POST",{});await load();say("سند باطل شد؛ سابقه آن حفظ شده است.")}catch(e){say(e.message,true);cancel.disabled=false}});actions.append(cancel)}
   card.append(actions);list.append(card);
  });
 }
 function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
 function printInvoice(inv){
  const title=inv.documentType==="invoice"?"فاکتور فروش":"پیش‌فاکتور";
  const rows=inv.items.map((x,i)=>"<tr><td>"+(i+1).toLocaleString("fa-IR")+"</td><td>"+escapeHtml(x.itemName)+"</td><td>"+escapeHtml(x.unit)+"</td><td>"+x.quantity.toLocaleString("fa-IR")+"</td><td>"+money(x.unitPriceToman)+"</td><td>"+money(x.lineTotalToman)+"</td></tr>").join("");
  const html="<!doctype html><html lang='fa' dir='rtl'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+title+" "+escapeHtml(inv.invoiceNumber)+"</title><style>*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#20242b;margin:0;padding:28px;font-size:12px}header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #b68a3b;padding-bottom:18px;margin-bottom:22px}h1{font-size:22px;margin:0 0 8px}h2{font-size:15px;margin:22px 0 10px}.muted{color:#666;line-height:2}.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}.meta div,.totals{border:1px solid #ddd;border-radius:8px;padding:12px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:10px;text-align:right}th{background:#f3f0e9}.totals{width:min(100%,360px);margin:18px 0 0 auto}.totalrow{display:flex;justify-content:space-between;padding:5px 0}.grand{border-top:1px solid #bbb;margin-top:8px;padding-top:12px;font-weight:bold;font-size:15px}.notes{margin-top:20px;white-space:pre-wrap}.sign{display:flex;justify-content:space-between;margin-top:70px;color:#666}@media print{body{padding:8mm}@page{size:A4;margin:10mm}}</style></head><body><header><div><h1>"+escapeHtml(inv.sellerName||"نوا")+"</h1><div class='muted'>"+title+"</div></div><div><strong>"+escapeHtml(inv.invoiceNumber)+"</strong><div class='muted'>تاریخ صدور: "+date(inv.issueDate)+"</div>"+(inv.dueDate?"<div class='muted'>سررسید: "+date(inv.dueDate)+"</div>":"")+"</div></header><section class='meta'><div><strong>خریدار</strong><div>"+escapeHtml(inv.customerName||"مشتری آزاد")+"</div><div class='muted'>"+escapeHtml(inv.customerPhone)+"</div><div class='muted'>"+escapeHtml(inv.customerAddress)+"</div></div><div><strong>مشخصات سند</strong><div class='muted'>شماره: "+escapeHtml(inv.invoiceNumber)+"</div><div class='muted'>وضعیت: "+(inv.documentType==="invoice"?(inv.paymentStatus==="paid"?"تسویه‌شده":inv.paymentStatus==="partially_paid"?"پرداخت جزئی":"پرداخت‌نشده"):"پیش‌فاکتور")+"</div></div></section><table><thead><tr><th>ردیف</th><th>شرح کالا / خدمت</th><th>واحد</th><th>تعداد</th><th>قیمت واحد</th><th>مبلغ</th></tr></thead><tbody>"+rows+"</tbody></table><div class='totals'><div class='totalrow'><span>جمع اقلام</span><strong>"+money(inv.subtotalToman)+"</strong></div><div class='totalrow'><span>تخفیف</span><strong>"+money(inv.discountToman)+"</strong></div><div class='totalrow'><span>مالیات</span><strong>"+money(inv.taxToman)+"</strong></div><div class='totalrow'><span>هزینه حمل</span><strong>"+money(inv.shippingToman)+"</strong></div><div class='totalrow grand'><span>مبلغ نهایی</span><strong>"+money(inv.totalToman)+"</strong></div>"+(inv.documentType==="invoice"?"<div class='totalrow'><span>دریافت‌شده</span><strong>"+money(inv.paidToman)+"</strong></div><div class='totalrow'><span>مانده</span><strong>"+money(inv.dueToman)+"</strong></div>":"")+"</div>"+(inv.notes?"<div class='notes'><strong>توضیحات:</strong> "+escapeHtml(inv.notes)+"</div>":"")+"<div class='sign'><span>مهر و امضای فروشنده</span><span>امضای خریدار</span></div><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>";
  const w=window.open("","_blank");if(!w){say("پنجره چاپ مسدود شد؛ اجازه بازشدن پنجره جدید را در مرورگر فعال کن.",true);return}w.document.open();w.document.write(html);w.document.close();
 }
 async function load(){
  if(!businessId()){orders=[];invoices=[];renderOrderOptions();renderInvoices();say("ابتدا یک پرونده کسب‌وکار انتخاب کن.",true);return}
  try{const [o,i]=await Promise.all([api("/orders?status=all"),api("/invoices")]);orders=o.orders||[];invoices=i.invoices||[];renderOrderOptions();renderInvoices();say("فهرست سفارش‌ها و اسناد فروش به‌روز شد.")}catch(e){say(e.message,true)}
 }
 $("bizInvoiceOrder").addEventListener("change",syncDocumentType);
 $("bizInvoiceType").addEventListener("change",syncDocumentType);
 ["bizInvoiceDiscount","bizInvoiceTax","bizInvoiceShipping"].forEach(id=>$(id).addEventListener("input",e=>{const v=digits(e.target.value);if(e.target.value!==v)e.target.value=v}));
 $("bizInvoiceForm").addEventListener("submit",async e=>{
  e.preventDefault();if(busy)return;
  const orderId=$("bizInvoiceOrder").value;if(!orderId){say("ابتدا سفارش را انتخاب کن.",true);return}
  const type=$("bizInvoiceType").value,order=orders.find(x=>x.id===orderId);
  if(type==="invoice"&&order?.status!=="confirmed"){say("فاکتور نهایی فقط برای سفارش تأییدشده صادر می‌شود.",true);return}
  const button=$("bizInvoiceSubmit");busy=true;button.disabled=true;
  try{const result=await api("/invoices/from-order/"+encodeURIComponent(orderId),"POST",{documentType:type,discountToman:integer($("bizInvoiceDiscount").value),taxToman:integer($("bizInvoiceTax").value),shippingToman:integer($("bizInvoiceShipping").value),notes:$("bizInvoiceNotes").value.trim()});await load();say(result.alreadyExists?"این سند قبلاً صادر شده بود و همان نسخه نمایش داده شد.":"سند با شماره "+result.invoice.invoiceNumber+" صادر شد.");const created=invoices.find(x=>x.id===result.invoice.id);if(created)printInvoice(created);$("bizInvoiceForm").reset();syncDocumentType()}catch(err){say(err.message,true)}finally{busy=false;button.disabled=false}
 });
 $("bizProfileSelect")?.addEventListener("change",load);window.addEventListener("nava:business-selection-changed",load);window.addEventListener("nava:business-auth-changed",load);window.addEventListener("nava:business-order-updated",load);window.addEventListener("focus",load);
 load();
})();
