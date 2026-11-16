// NAVA BUSINESS — proforma and issued invoice documents.
import { json, safeNaviText } from "./shared.js";

const clean=(v,n)=>safeNaviText(v??"",n);
const reply=(data,status,origin)=>json({success:status<400,...data},status,origin);
const fail=(message,status,origin)=>reply({error:message},status,origin);
const validId=(v,p)=>new RegExp("^"+p+"-[0-9a-f-]{36}$","i").test(v||"");
const MAX=1000000000000;
const validDate=v=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v||""))return false;
 const d=new Date(v+"T00:00:00.000Z");
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;
};
const amount=(v,label)=>{
 const n=Number(v??0);
 return Number.isSafeInteger(n)&&n>=0&&n<=MAX?{value:n}:{error:label+" باید عدد صحیح نامنفی به تومان باشد."};
};
export function normalizeInvoiceAdjustments(input,subtotal){
 if(!Number.isSafeInteger(subtotal)||subtotal<1||subtotal>MAX)return{error:"جمع اقلام سفارش معتبر نیست."};
 const discount=amount(input?.discountToman,"تخفیف"),tax=amount(input?.taxToman,"مالیات"),shipping=amount(input?.shippingToman,"هزینه حمل");
 if(discount.error||tax.error||shipping.error)return{error:discount.error||tax.error||shipping.error};
 if(discount.value>subtotal)return{error:"تخفیف نمی‌تواند از جمع اقلام بیشتر باشد."};
 const total=subtotal-discount.value+tax.value+shipping.value;
 if(!Number.isSafeInteger(total)||total<1||total>MAX)return{error:"مبلغ نهایی سند باید مثبت و حداکثر یک‌هزار میلیارد تومان باشد."};
 return{value:{discount_toman:discount.value,tax_toman:tax.value,shipping_toman:shipping.value,total_toman:total}};
}
async function owns(db,b,o){
 return db.prepare("SELECT id,name FROM business_profiles_v1 WHERE id=? AND owner_id=? AND status='active' LIMIT 1").bind(b,o).first();
}
async function invoiceOut(db,b,o,id){
 const r=await db.prepare(
  "SELECT i.*,c.name AS live_customer_name,COALESCE((SELECT SUM(p.amount_toman) FROM business_customer_payments_v1 p WHERE p.invoice_id=i.id AND p.business_id=i.business_id AND p.owner_id=i.owner_id AND p.status='received'),0) AS paid_toman FROM business_invoices_v1 i LEFT JOIN business_customers_v1 c ON c.id=i.customer_id AND c.business_id=i.business_id AND c.owner_id=i.owner_id WHERE i.id=? AND i.business_id=? AND i.owner_id=?"
 ).bind(id,b,o).first();
 if(!r)return null;
 const lines=await db.prepare("SELECT id,item_name,unit,quantity,unit_price_toman,line_total_toman FROM business_invoice_items_v1 WHERE invoice_id=? AND business_id=? AND owner_id=? ORDER BY created_at,id").bind(id,b,o).all();
 const paid=Number(r.paid_toman||0),total=Number(r.total_toman);
 return{id:r.id,orderId:r.order_id,documentType:r.document_type,invoiceSequence:Number(r.invoice_sequence),invoiceNumber:r.invoice_number,status:r.status,issueDate:r.issue_date,dueDate:r.due_date||"",sellerName:r.seller_name,customerId:r.customer_id||null,customerName:r.customer_name||r.live_customer_name||"",customerPhone:r.customer_phone||"",customerAddress:r.customer_address||"",subtotalToman:Number(r.subtotal_toman),discountToman:Number(r.discount_toman),taxToman:Number(r.tax_toman),shippingToman:Number(r.shipping_toman),totalToman:total,paidToman:paid,dueToman:Math.max(0,total-paid),paymentStatus:r.status==="voided"?"voided":paid>=total?"paid":paid>0?"partially_paid":"unpaid",notes:r.notes||"",items:(lines.results||[]).map(x=>({id:x.id,itemName:x.item_name,unit:x.unit,quantity:Number(x.quantity),unitPriceToman:Number(x.unit_price_toman),lineTotalToman:Number(x.line_total_toman)})),createdAt:r.created_at};
}
export async function handleBusinessInvoiceRoute({request,env,url,corsOrigin,businessId,ownerId,resourceId="",action=""}){
 try{
  const db=env.NAVA_DB;
  if(!db)return fail("دیتابیس کسب‌وکار در دسترس نیست.",503,corsOrigin);
  if(!validId(businessId,"biz")||!await owns(db,businessId,ownerId))return fail("پرونده کسب‌وکار پیدا نشد.",404,corsOrigin);
  if(!resourceId&&request.method==="GET"){
   const rows=await db.prepare("SELECT id FROM business_invoices_v1 WHERE business_id=? AND owner_id=? ORDER BY issue_date DESC,created_at DESC LIMIT 300").bind(businessId,ownerId).all();
   const invoices=[];for(const row of rows.results||[])invoices.push(await invoiceOut(db,businessId,ownerId,row.id));
   return reply({invoices},200,corsOrigin);
  }
  if(resourceId==="from-order"&&action&&request.method==="POST"){
   const orderId=action;
   if(!validId(orderId,"order"))return fail("شناسه سفارش معتبر نیست.",400,corsOrigin);
   let input={};try{input=await request.json();}catch{return fail("بدنه درخواست معتبر نیست.",400,corsOrigin);}
   const type=String(input.documentType||"invoice");
   if(!["invoice","proforma"].includes(type))return fail("نوع سند معتبر نیست.",400,corsOrigin);
   const order=await db.prepare("SELECT o.*,c.name AS customer_name,c.phone AS customer_phone,c.address AS customer_address,b.name AS seller_name FROM business_orders_v1 o JOIN business_profiles_v1 b ON b.id=o.business_id AND b.owner_id=o.owner_id LEFT JOIN business_customers_v1 c ON c.id=o.customer_id AND c.business_id=o.business_id AND c.owner_id=o.owner_id WHERE o.id=? AND o.business_id=? AND o.owner_id=?").bind(orderId,businessId,ownerId).first();
   if(!order)return fail("سفارش پیدا نشد.",404,corsOrigin);
   if(type==="invoice"&&order.status!=="confirmed")return fail("فاکتور نهایی فقط پس از تأیید سفارش قابل صدور است؛ برای سفارش پیش‌نویس پیش‌فاکتور صادر کن.",409,corsOrigin);
   if(order.status==="cancelled")return fail("برای سفارش لغوشده سند صادر نمی‌شود.",409,corsOrigin);
   const existing=await db.prepare("SELECT id FROM business_invoices_v1 WHERE order_id=? AND business_id=? AND owner_id=? AND document_type=?").bind(orderId,businessId,ownerId,type).first();
   if(existing)return reply({invoice:await invoiceOut(db,businessId,ownerId,existing.id),alreadyExists:true},200,corsOrigin);
   const lines=await db.prepare("SELECT oi.catalog_item_id,oi.item_name,oi.quantity,oi.unit_price_toman,oi.line_total_toman,COALESCE(ci.unit,'عدد') AS unit FROM business_order_items_v1 oi LEFT JOIN business_catalog_items_v1 ci ON ci.id=oi.catalog_item_id AND ci.business_id=oi.business_id AND ci.owner_id=oi.owner_id WHERE oi.order_id=? AND oi.business_id=? AND oi.owner_id=? ORDER BY oi.created_at,oi.id").bind(orderId,businessId,ownerId).all();
   if(!lines.results?.length)return fail("سفارش ردیف قابل صدور ندارد.",409,corsOrigin);
   const subtotal=lines.results.reduce((s,x)=>s+Number(x.line_total_toman),0);
   const adjustments=normalizeInvoiceAdjustments(input,subtotal);
   if(adjustments.error)return fail(adjustments.error,400,corsOrigin);
   const {discount_toman:discount,tax_toman:tax,shipping_toman:shipping,total_toman:total}=adjustments.value;
   const issueDate=String(input.issueDate||order.order_date);
   const dueDate=String(input.dueDate||"");
   if(!validDate(issueDate)||(dueDate&&!validDate(dueDate)))return fail("تاریخ صدور یا سررسید معتبر نیست.",400,corsOrigin);
   if(dueDate&&dueDate<issueDate)return fail("تاریخ سررسید نمی‌تواند قبل از تاریخ صدور باشد.",400,corsOrigin);
   const id="invoice-"+crypto.randomUUID(),prefix=type==="invoice"?"INV":"PRO";
   const batch=[
    db.prepare("INSERT INTO business_invoices_v1(id,business_id,owner_id,order_id,document_type,invoice_sequence,invoice_number,status,issue_date,due_date,seller_name,customer_id,customer_name,customer_phone,customer_address,subtotal_toman,discount_toman,tax_toman,shipping_toman,total_toman,notes,created_at,updated_at) SELECT ?,?,?,?, ?,COALESCE((SELECT MAX(invoice_sequence)+1 FROM business_invoices_v1 WHERE business_id=? AND owner_id=? AND document_type=?),1),?, 'issued',?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now') WHERE EXISTS(SELECT 1 FROM business_orders_v1 WHERE id=? AND business_id=? AND owner_id=? AND status<>'cancelled') AND (?='proforma' OR EXISTS(SELECT 1 FROM business_orders_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='confirmed')) AND NOT EXISTS(SELECT 1 FROM business_invoices_v1 WHERE order_id=? AND business_id=? AND owner_id=? AND document_type=?)").bind(id,businessId,ownerId,orderId,type,businessId,ownerId,type,prefix+"-PENDING",issueDate,dueDate,order.seller_name,order.customer_id,order.customer_name||"مشتری آزاد",order.customer_phone||"",order.customer_address||"",subtotal,discount,tax,shipping,total,clean(input.notes||order.notes,1200),orderId,businessId,ownerId,type,orderId,businessId,ownerId,orderId,businessId,ownerId,type),
    ...lines.results.map(x=>db.prepare("INSERT INTO business_invoice_items_v1(id,invoice_id,business_id,owner_id,catalog_item_id,item_name,unit,quantity,unit_price_toman,line_total_toman,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,datetime('now') WHERE EXISTS(SELECT 1 FROM business_invoices_v1 WHERE id=? AND business_id=? AND owner_id=?)").bind("invoiceline-"+crypto.randomUUID(),id,businessId,ownerId,x.catalog_item_id,x.item_name,x.unit,Number(x.quantity),Number(x.unit_price_toman),Number(x.line_total_toman),id,businessId,ownerId))
   ];
   let results;
   try{
    results=await db.batch(batch);
   }catch(batchError){
    // A concurrent request may have created this order/type after the pre-check.
    // Recover that idempotent race instead of returning a generic 500.
    const raced=await db.prepare("SELECT id FROM business_invoices_v1 WHERE order_id=? AND business_id=? AND owner_id=? AND document_type=?").bind(orderId,businessId,ownerId,type).first();
    if(raced)return reply({invoice:await invoiceOut(db,businessId,ownerId,raced.id),alreadyExists:true},200,corsOrigin);
    throw batchError;
   }
   if(Number(results?.[0]?.meta?.changes||0)!==1){
    const raced=await db.prepare("SELECT id FROM business_invoices_v1 WHERE order_id=? AND business_id=? AND owner_id=? AND document_type=?").bind(orderId,businessId,ownerId,type).first();
    if(raced)return reply({invoice:await invoiceOut(db,businessId,ownerId,raced.id),alreadyExists:true},200,corsOrigin);
    return fail("سند صادر نشد؛ وضعیت سفارش را تازه‌سازی کن.",409,corsOrigin);
   }
   const sequence=Number((await db.prepare("SELECT invoice_sequence FROM business_invoices_v1 WHERE id=? AND business_id=? AND owner_id=?").bind(id,businessId,ownerId).first())?.invoice_sequence||0);
   if(!sequence)throw new Error("Invoice sequence not confirmed.");
   await db.prepare("UPDATE business_invoices_v1 SET invoice_number=? WHERE id=? AND business_id=? AND owner_id=?").bind(prefix+"-"+String(sequence).padStart(6,"0"),id,businessId,ownerId).run();
   return reply({invoice:await invoiceOut(db,businessId,ownerId,id),created:true},201,corsOrigin);
  }
  if(resourceId&&validId(resourceId,"invoice")&&action==="void"&&request.method==="POST"){
   const paid=await db.prepare("SELECT COALESCE(SUM(amount_toman),0) AS paid FROM business_customer_payments_v1 WHERE invoice_id=? AND business_id=? AND owner_id=? AND status='received'").bind(resourceId,businessId,ownerId).first();
   if(Number(paid?.paid||0)>0)return fail("این سند دریافت ثبت‌شده دارد؛ ابتدا دریافت‌های مرتبط را ابطال کن.",409,corsOrigin);
   const result=await db.prepare("UPDATE business_invoices_v1 SET status='voided',updated_at=datetime('now') WHERE id=? AND business_id=? AND owner_id=? AND status='issued'").bind(resourceId,businessId,ownerId).run();
   if(Number(result.meta?.changes||0)!==1)return fail("سند پیدا نشد یا قبلاً باطل شده است.",404,corsOrigin);
   return reply({voided:true},200,corsOrigin);
  }
  if(resourceId&&validId(resourceId,"invoice")&&request.method==="GET"){
   const invoice=await invoiceOut(db,businessId,ownerId,resourceId);
   return invoice?reply({invoice},200,corsOrigin):fail("سند پیدا نشد.",404,corsOrigin);
  }
  return fail("مسیر یا روش درخواست فاکتور پشتیبانی نمی‌شود.",405,corsOrigin);
 }catch(error){
  console.error("[NAVA BUSINESS INVOICES]",error);
  return fail("عملیات فاکتور انجام نشد؛ اجرای Migration شماره ۰۰۱۲ را بررسی کن.",500,corsOrigin);
 }
}
