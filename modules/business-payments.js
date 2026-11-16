// NAVA BUSINESS — customer receipts and account balances.
import { json, safeNaviText } from "./shared.js";
import { ensureBusinessCashLedger } from "./business-ledger.js";

const clean=(v,n)=>safeNaviText(v??"",n);
const reply=(data,status,origin)=>json({success:status<400,...data},status,origin);
const fail=(message,status,origin)=>reply({error:message},status,origin);
const validId=(v,p)=>new RegExp("^"+p+"-[0-9a-f-]{36}$","i").test(v||"");
const validDate=v=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v||""))return false;
 const d=new Date(v+"T00:00:00.000Z");
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;
};
const METHODS=new Set(["cash","card","bank_transfer","other"]);
export function normalizeCustomerPaymentInput(input){
 if(!input||typeof input!=="object"||Array.isArray(input))return{error:"اطلاعات دریافت وجه معتبر نیست."};
 const customerId=String(input.customerId||"").trim();
 if(!validId(customerId,"customer"))return{error:"یک مشتری معتبر انتخاب کن."};
 const amount=Number(input.amountToman);
 if(!Number.isSafeInteger(amount)||amount<1||amount>1000000000000)return{error:"مبلغ دریافتی باید عدد صحیح مثبت به تومان باشد."};
 const paymentDate=String(input.paymentDate||"");
 if(!validDate(paymentDate))return{error:"تاریخ دریافت وجه معتبر نیست."};
 const method=String(input.paymentMethod||"");
 if(!METHODS.has(method))return{error:"روش دریافت وجه معتبر نیست."};
 const invoiceId=String(input.invoiceId||"").trim();
 if(invoiceId&&!validId(invoiceId,"invoice"))return{error:"شناسه فاکتور معتبر نیست."};
 const cashAccountId=String(input.cashAccountId||"").trim();
 if(cashAccountId&&!validId(cashAccountId,"cash"))return{error:"شناسه حساب مالی معتبر نیست."};
 return{value:{customer_id:customerId,invoice_id:invoiceId||null,cash_account_id:cashAccountId||null,amount_toman:amount,payment_date:paymentDate,payment_method:method,reference:clean(input.reference,120),notes:clean(input.notes,800)}};
}
function paymentOut(r){return{id:r.id,customerId:r.customer_id,customerName:r.customer_name||"",invoiceId:r.invoice_id||null,invoiceNumber:r.invoice_number||"",amountToman:Number(r.amount_toman),paymentDate:r.payment_date,paymentMethod:r.payment_method,reference:r.reference||"",notes:r.notes||"",status:r.status,createdAt:r.created_at};}
async function owns(db,b,o){
 return db.prepare("SELECT id FROM business_profiles_v1 WHERE id=? AND owner_id=? AND status='active' LIMIT 1").bind(b,o).first();
}
export async function handleBusinessPaymentsRoute({request,env,url,corsOrigin,businessId,ownerId,resourceId="",action=""}){
 try{
  const db=env.NAVA_DB;
  if(!db)return fail("دیتابیس کسب‌وکار در دسترس نیست.",503,corsOrigin);
  if(!validId(businessId,"biz")||!await owns(db,businessId,ownerId))return fail("پرونده کسب‌وکار پیدا نشد.",404,corsOrigin);
  await ensureBusinessCashLedger(db,businessId,ownerId);
  if(!resourceId&&request.method==="GET"&&url.pathname.endsWith("/accounts")){
   const rows=await db.prepare(
    "SELECT c.id,c.name,c.phone,c.status,"+
    "COALESCE(s.sales_toman,0) AS sales_toman,COALESCE(p.received_toman,0) AS received_toman "+
    "FROM business_customers_v1 c "+
    "LEFT JOIN (SELECT customer_id,SUM(amount_toman) AS sales_toman FROM business_transactions_v1 WHERE business_id=? AND owner_id=? AND transaction_type='sale' AND customer_id IS NOT NULL GROUP BY customer_id) s ON s.customer_id=c.id "+
    "LEFT JOIN (SELECT customer_id,SUM(amount_toman) AS received_toman FROM business_customer_payments_v1 WHERE business_id=? AND owner_id=? AND status='received' GROUP BY customer_id) p ON p.customer_id=c.id "+
    "WHERE c.business_id=? AND c.owner_id=? ORDER BY CASE WHEN c.status='active' THEN 0 ELSE 1 END,c.name COLLATE NOCASE"
   ).bind(businessId,ownerId,businessId,ownerId,businessId,ownerId).all();
   const accounts=(rows.results||[]).map(r=>({customerId:r.id,customerName:r.name,phone:r.phone||"",status:r.status,salesToman:Number(r.sales_toman||0),receivedToman:Number(r.received_toman||0),balanceToman:Number(r.sales_toman||0)-Number(r.received_toman||0)}));
   const totals=accounts.reduce((a,r)=>({salesToman:a.salesToman+r.salesToman,receivedToman:a.receivedToman+r.receivedToman,balanceToman:a.balanceToman+r.balanceToman}),{salesToman:0,receivedToman:0,balanceToman:0});
   return reply({accounts,totals},200,corsOrigin);
  }
  if(!resourceId&&request.method==="GET"){
   const rows=await db.prepare(
    "SELECT p.*,c.name AS customer_name,i.invoice_number FROM business_customer_payments_v1 p JOIN business_customers_v1 c ON c.id=p.customer_id AND c.business_id=p.business_id AND c.owner_id=p.owner_id LEFT JOIN business_invoices_v1 i ON i.id=p.invoice_id AND i.business_id=p.business_id AND i.owner_id=p.owner_id WHERE p.business_id=? AND p.owner_id=? ORDER BY p.payment_date DESC,p.created_at DESC LIMIT 200"
   ).bind(businessId,ownerId).all();
   return reply({payments:(rows.results||[]).map(paymentOut)},200,corsOrigin);
  }
  if(!resourceId&&request.method==="POST"){
   let input;try{input=await request.json();}catch{return fail("بدنه درخواست معتبر نیست.",400,corsOrigin);}
   const n=normalizeCustomerPaymentInput(input);if(n.error)return fail(n.error,400,corsOrigin);
   const customer=await db.prepare("SELECT id FROM business_customers_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='active' LIMIT 1").bind(n.value.customer_id,businessId,ownerId).first();
   if(!customer)return fail("مشتری فعال این پرونده پیدا نشد.",404,corsOrigin);
   const v=n.value;
   const cashAccount=v.cash_account_id
    ? await db.prepare("SELECT id FROM business_cash_accounts_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='active'").bind(v.cash_account_id,businessId,ownerId).first()
    : await db.prepare("SELECT id FROM business_cash_accounts_v1 WHERE business_id=? AND owner_id=? AND status='active' ORDER BY created_at,id LIMIT 1").bind(businessId,ownerId).first();
   if(!cashAccount)return fail("حساب مالی فعالی برای ثبت دریافت وجود ندارد؛ ابتدا یک حساب بساز.",409,corsOrigin);
   if(v.invoice_id){
    const invoice=await db.prepare("SELECT id,customer_id,total_toman,status,document_type FROM business_invoices_v1 WHERE id=? AND business_id=? AND owner_id=?").bind(v.invoice_id,businessId,ownerId).first();
    if(!invoice||invoice.status!=="issued"||invoice.document_type!=="invoice")return fail("فاکتور فعال و قابل دریافت پیدا نشد.",404,corsOrigin);
    if(invoice.customer_id!==v.customer_id)return fail("این فاکتور متعلق به مشتری انتخاب‌شده نیست.",409,corsOrigin);
    const paid=await db.prepare("SELECT COALESCE(SUM(amount_toman),0) AS total FROM business_customer_payments_v1 WHERE invoice_id=? AND business_id=? AND owner_id=? AND status='received'").bind(v.invoice_id,businessId,ownerId).first();
    if(v.amount_toman>Number(invoice.total_toman)-Number(paid?.total||0))return fail("مبلغ دریافت از مانده فاکتور بیشتر است.",409,corsOrigin);
   }
   const id="payment-"+crypto.randomUUID(),moveId="cashmove-"+crypto.randomUUID();
   const result=await db.batch([
    db.prepare("INSERT INTO business_customer_payments_v1(id,business_id,owner_id,customer_id,amount_toman,payment_date,payment_method,reference,notes,status,created_at,updated_at,cash_account_id,invoice_id) SELECT ?,?,?,?,?,?,?,?,?,'received',datetime('now'),datetime('now'),?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM business_invoices_v1 i WHERE i.id=? AND i.business_id=? AND i.owner_id=? AND i.customer_id=? AND i.document_type='invoice' AND i.status='issued' AND i.total_toman-(SELECT COALESCE(SUM(p.amount_toman),0) FROM business_customer_payments_v1 p WHERE p.invoice_id=i.id AND p.business_id=i.business_id AND p.owner_id=i.owner_id AND p.status='received')>=?)").bind(id,businessId,ownerId,v.customer_id,v.amount_toman,v.payment_date,v.payment_method,v.reference,v.notes,cashAccount.id,v.invoice_id,v.invoice_id,v.invoice_id,businessId,ownerId,v.customer_id,v.amount_toman),
    db.prepare("INSERT INTO business_cash_movements_v1(id,business_id,owner_id,cash_account_id,direction,amount_toman,movement_date,source_type,source_id,title,method,reference,notes,status,created_at) SELECT ?,?,?,?,'in',?,?,'customer_receipt',?,'دریافت از مشتری',?,?,?,'active',datetime('now') WHERE EXISTS(SELECT 1 FROM business_customer_payments_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='received')").bind(moveId,businessId,ownerId,cashAccount.id,v.amount_toman,v.payment_date,id,v.payment_method,v.reference,v.notes,id,businessId,ownerId)
   ]);
   if(Number(result?.[0]?.meta?.changes||0)!==1)throw new Error("Payment insert not confirmed.");
   if(Number(result?.[1]?.meta?.changes||0)!==1)throw new Error("Customer receipt cash movement not confirmed.");
   const row=await db.prepare("SELECT p.*,c.name AS customer_name,i.invoice_number FROM business_customer_payments_v1 p JOIN business_customers_v1 c ON c.id=p.customer_id LEFT JOIN business_invoices_v1 i ON i.id=p.invoice_id WHERE p.id=? AND p.business_id=? AND p.owner_id=?").bind(id,businessId,ownerId).first();
   return reply({payment:paymentOut(row),cashMovementId:moveId,saved:true},201,corsOrigin);
  }
  if(resourceId&&action==="void"&&request.method==="POST"){
   if(!validId(resourceId,"payment"))return fail("شناسه دریافت وجه معتبر نیست.",400,corsOrigin);
   const result=await db.batch([
    db.prepare("UPDATE business_customer_payments_v1 SET status='voided',updated_at=datetime('now') WHERE id=? AND business_id=? AND owner_id=? AND status='received'").bind(resourceId,businessId,ownerId),
    db.prepare("UPDATE business_cash_movements_v1 SET status='voided' WHERE source_type='customer_receipt' AND source_id=? AND business_id=? AND owner_id=? AND status='active' AND EXISTS(SELECT 1 FROM business_customer_payments_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='voided')").bind(resourceId,businessId,ownerId,resourceId,businessId,ownerId)
   ]);
   if(Number(result?.[0]?.meta?.changes||0)!==1)return fail("دریافت وجه پیدا نشد یا قبلاً باطل شده است.",404,corsOrigin);
   if(Number(result?.[1]?.meta?.changes||0)!==1)throw new Error("Customer receipt cash reversal not confirmed.");
   return reply({voided:true,paymentId:resourceId},200,corsOrigin);
  }
  return fail("مسیر یا روش دریافت وجه پشتیبانی نمی‌شود.",405,corsOrigin);
 }catch(error){
  console.error("[NAVA BUSINESS PAYMENTS]",error);
  return fail("عملیات دریافت وجه انجام نشد؛ اجرای Migration شماره ۰۰۱۰ را بررسی کن.",500,corsOrigin);
 }
}
