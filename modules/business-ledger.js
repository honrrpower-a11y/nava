// NAVA BUSINESS — supplier payables and cash ledger.
import { json, safeNaviText } from "./shared.js";

const clean=(v,n)=>safeNaviText(v??"",n);
const reply=(d,s,o)=>json({success:s<400,...d},s,o);
const fail=(m,s,o)=>reply({error:m},s,o);
const idOk=(v,p)=>new RegExp("^"+p+"-[0-9a-f-]{36}$","i").test(v||"");
const validDate=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||""))return false;const d=new Date(v+"T00:00:00.000Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;};
const METHODS=new Set(["cash","card","bank_transfer","other"]);
const ACCOUNT_TYPES=new Set(["cash","bank","card","other"]);
const MAX=1000000000000;

export function normalizeSupplierInput(x,partial=false){
 if(!x||typeof x!=="object"||Array.isArray(x))return{error:"اطلاعات تأمین‌کننده معتبر نیست."};
 const v={};
 if(!partial||Object.hasOwn(x,"name")){v.name=clean(x.name,120);if(v.name.length<2)return{error:"نام تأمین‌کننده باید حداقل ۲ نویسه باشد."};}
 for(const[k,n]of [["phone",40],["email",160],["address",500],["notes",1000]])if(!partial||Object.hasOwn(x,k))v[k]=clean(x[k],n);
 if(v.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))return{error:"ایمیل تأمین‌کننده معتبر نیست."};
 return Object.keys(v).length?{value:v}:{error:"هیچ تغییری ارسال نشده است."};
}
export function normalizeCashAccountInput(x){
 if(!x||typeof x!=="object"||Array.isArray(x))return{error:"اطلاعات حساب مالی معتبر نیست."};
 const name=clean(x.name,100),type=String(x.accountType||"");
 const opening=Number(x.openingBalanceToman||0);
 if(name.length<2)return{error:"نام حساب باید حداقل ۲ نویسه باشد."};
 if(!ACCOUNT_TYPES.has(type))return{error:"نوع حساب مالی معتبر نیست."};
 if(!Number.isSafeInteger(opening)||opening<0||opening>MAX)return{error:"موجودی افتتاحیه باید عدد صحیح صفر یا بیشتر باشد."};
 return{value:{name,account_type:type,opening_balance_toman:opening}};
}
export function normalizeCashMovementInput(x){
 if(!x||typeof x!=="object"||Array.isArray(x))return{error:"اطلاعات گردش مالی معتبر نیست."};
 const direction=String(x.direction||""),amount=Number(x.amountToman),date=String(x.movementDate||"");
 if(!["in","out"].includes(direction))return{error:"نوع گردش باید ورود یا خروج وجه باشد."};
 if(!Number.isSafeInteger(amount)||amount<1||amount>MAX)return{error:"مبلغ گردش باید عدد صحیح مثبت باشد."};
 if(!validDate(date))return{error:"تاریخ گردش مالی معتبر نیست."};
 return{value:{direction,amount_toman:amount,movement_date:date,title:clean(x.title,140),method:METHODS.has(x.method)?x.method:"other",reference:clean(x.reference,120),notes:clean(x.notes,800)}};
}
export function normalizeExpensePaymentInput(x){
 if(!x||typeof x!=="object"||Array.isArray(x))return{error:"اطلاعات پرداخت هزینه معتبر نیست."};
 const transactionId=String(x.transactionId||""),cashAccountId=String(x.cashAccountId||"");
 const supplierId=String(x.supplierId||"").trim()||null,amount=Number(x.amountToman),date=String(x.paymentDate||""),method=String(x.paymentMethod||"");
 if(!idOk(transactionId,"txn"))return{error:"هزینه معتبری انتخاب نشده است."};
 if(!idOk(cashAccountId,"cash"))return{error:"حساب پرداخت را انتخاب کن."};
 if(supplierId&&!idOk(supplierId,"supplier"))return{error:"شناسه تأمین‌کننده معتبر نیست."};
 if(!Number.isSafeInteger(amount)||amount<1||amount>MAX)return{error:"مبلغ پرداخت باید عدد صحیح مثبت باشد."};
 if(!validDate(date))return{error:"تاریخ پرداخت معتبر نیست."};
 if(!METHODS.has(method))return{error:"روش پرداخت معتبر نیست."};
 return{value:{transaction_id:transactionId,cash_account_id:cashAccountId,supplier_id:supplierId,amount_toman:amount,payment_date:date,payment_method:method,reference:clean(x.reference,120),notes:clean(x.notes,800)}};
}
async function owns(db,b,o){return db.prepare("SELECT id FROM business_profiles_v1 WHERE id=? AND owner_id=? AND status='active' LIMIT 1").bind(b,o).first();}
function supplierOut(r){return{id:r.id,name:r.name,phone:r.phone||"",email:r.email||"",address:r.address||"",notes:r.notes||"",status:r.status,createdAt:r.created_at,updatedAt:r.updated_at};}
function accountOut(r){return{id:r.id,name:r.name,accountType:r.account_type,openingBalanceToman:Number(r.opening_balance_toman||0),balanceToman:Number(r.balance_toman||0),status:r.status};}
function cashMoveOut(r){return{id:r.id,cashAccountId:r.cash_account_id,direction:r.direction,amountToman:Number(r.amount_toman),movementDate:r.movement_date,sourceType:r.source_type,sourceId:r.source_id,title:r.title||"",method:r.method,reference:r.reference||"",notes:r.notes||"",status:r.status};}

export async function handleBusinessLedgerRoute({request,env,url,corsOrigin,businessId,ownerId,resource,resourceId="",action=""}){
 try{
  const db=env.NAVA_DB;if(!db)return fail("دیتابیس کسب‌وکار در دسترس نیست.",503,corsOrigin);
  if(!idOk(businessId,"biz")||!await owns(db,businessId,ownerId))return fail("پرونده کسب‌وکار پیدا نشد.",404,corsOrigin);
  if(resource==="suppliers"){
   if(resourceId&&!idOk(resourceId,"supplier"))return fail("شناسه تأمین‌کننده معتبر نیست.",400,corsOrigin);
   if(!resourceId&&request.method==="GET"){
    const rows=await db.prepare("SELECT s.*,COALESCE(e.total_toman,0) AS purchases_toman,COALESCE(p.paid_toman,0) AS paid_toman FROM business_suppliers_v1 s LEFT JOIN (SELECT supplier_id,SUM(amount_toman) total_toman FROM business_transactions_v1 WHERE business_id=? AND owner_id=? AND transaction_type='expense' AND supplier_id IS NOT NULL GROUP BY supplier_id)e ON e.supplier_id=s.id LEFT JOIN (SELECT supplier_id,SUM(amount_toman) paid_toman FROM business_expense_payments_v1 WHERE business_id=? AND owner_id=? AND status='paid' AND supplier_id IS NOT NULL GROUP BY supplier_id)p ON p.supplier_id=s.id WHERE s.business_id=? AND s.owner_id=? ORDER BY CASE WHEN s.status='active' THEN 0 ELSE 1 END,s.name COLLATE NOCASE").bind(businessId,ownerId,businessId,ownerId,businessId,ownerId).all();
    return reply({suppliers:(rows.results||[]).map(r=>({...supplierOut(r),purchasesToman:Number(r.purchases_toman||0),paidToman:Number(r.paid_toman||0),balanceToman:Number(r.purchases_toman||0)-Number(r.paid_toman||0)}))},200,corsOrigin);
   }
   if(!resourceId&&request.method==="POST"){
    let x;try{x=await request.json();}catch{return fail("بدنه درخواست معتبر نیست.",400,corsOrigin);}
    const n=normalizeSupplierInput(x);if(n.error)return fail(n.error,400,corsOrigin);const v=n.value,id="supplier-"+crypto.randomUUID();
    const r=await db.prepare("INSERT INTO business_suppliers_v1(id,business_id,owner_id,name,phone,email,address,notes,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'active',datetime('now'),datetime('now'))").bind(id,businessId,ownerId,v.name,v.phone,v.email,v.address,v.notes).run();
    if(Number(r.meta?.changes||0)!==1)throw new Error("Supplier insert not confirmed.");
    const row=await db.prepare("SELECT * FROM business_suppliers_v1 WHERE id=? AND business_id=? AND owner_id=?").bind(id,businessId,ownerId).first();
    return reply({supplier:supplierOut(row),saved:true},201,corsOrigin);
   }
   if(resourceId&&request.method==="PATCH"){
    let x;try{x=await request.json();}catch{return fail("بدنه درخواست معتبر نیست.",400,corsOrigin);}
    const n=normalizeSupplierInput(x,true);if(n.error)return fail(n.error,400,corsOrigin);const keys=Object.keys(n.value);
    const r=await db.prepare("UPDATE business_suppliers_v1 SET "+keys.map(k=>k+"=?").join(",")+",updated_at=datetime('now') WHERE id=? AND business_id=? AND owner_id=? AND status='active'").bind(...keys.map(k=>n.value[k]),resourceId,businessId,ownerId).run();
    if(Number(r.meta?.changes||0)!==1)return fail("تأمین‌کننده پیدا نشد یا بایگانی شده است.",404,corsOrigin);return reply({updated:true},200,corsOrigin);
   }
   if(resourceId&&request.method==="DELETE"){
    const r=await db.prepare("UPDATE business_suppliers_v1 SET status='archived',updated_at=datetime('now') WHERE id=? AND business_id=? AND owner_id=? AND status='active'").bind(resourceId,businessId,ownerId).run();
    if(Number(r.meta?.changes||0)!==1)return fail("تأمین‌کننده پیدا نشد یا قبلاً بایگانی شده است.",404,corsOrigin);return reply({archived:true},200,corsOrigin);
   }
  }
  if(resource==="cash-accounts"){
   if(!resourceId&&request.method==="GET"){
    const rows=await db.prepare("SELECT a.*,a.opening_balance_toman+COALESCE(SUM(CASE WHEN m.status='active' AND m.direction='in' THEN m.amount_toman WHEN m.status='active' AND m.direction='out' THEN -m.amount_toman ELSE 0 END),0) balance_toman FROM business_cash_accounts_v1 a LEFT JOIN business_cash_movements_v1 m ON m.cash_account_id=a.id AND m.business_id=a.business_id AND m.owner_id=a.owner_id WHERE a.business_id=? AND a.owner_id=? GROUP BY a.id ORDER BY CASE WHEN a.status='active' THEN 0 ELSE 1 END,a.created_at").bind(businessId,ownerId).all();
    return reply({accounts:(rows.results||[]).map(accountOut)},200,corsOrigin);
   }
   if(!resourceId&&request.method==="POST"){
    let x;try{x=await request.json();}catch{return fail("بدنه درخواست معتبر نیست.",400,corsOrigin);}
    const n=normalizeCashAccountInput(x);if(n.error)return fail(n.error,400,corsOrigin);const v=n.value,id="cash-"+crypto.randomUUID();
    const r=await db.prepare("INSERT INTO business_cash_accounts_v1(id,business_id,owner_id,name,account_type,opening_balance_toman,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'))").bind(id,businessId,ownerId,v.name,v.account_type,v.opening_balance_toman).run();
    if(Number(r.meta?.changes||0)!==1)throw new Error("Cash account insert not confirmed.");return reply({account:{id,name:v.name,accountType:v.account_type,openingBalanceToman:v.opening_balance_toman,balanceToman:v.opening_balance_toman,status:"active"},saved:true},201,corsOrigin);
   }
   if(resourceId&&request.method==="DELETE"){
    const balance=await db.prepare("SELECT a.opening_balance_toman+COALESCE(SUM(CASE WHEN m.status='active' AND m.direction='in' THEN m.amount_toman WHEN m.status='active' AND m.direction='out' THEN -m.amount_toman ELSE 0 END),0) balance FROM business_cash_accounts_v1 a LEFT JOIN business_cash_movements_v1 m ON m.cash_account_id=a.id AND m.business_id=a.business_id AND m.owner_id=a.owner_id WHERE a.id=? AND a.business_id=? AND a.owner_id=? AND a.status='active' GROUP BY a.id").bind(resourceId,businessId,ownerId).first();
    if(!balance)return fail("حساب مالی پیدا نشد.",404,corsOrigin);
    if(Number(balance.balance)!==0)return fail("فقط حساب با مانده صفر قابل بایگانی است؛ ابتدا انتقال یا اصلاح مانده را ثبت کن.",409,corsOrigin);
    await db.prepare("UPDATE business_cash_accounts_v1 SET status='archived',updated_at=datetime('now') WHERE id=? AND business_id=? AND owner_id=? AND status='active'").bind(resourceId,businessId,ownerId).run();
    return reply({archived:true},200,corsOrigin);
   }
  }
  if(resource==="cash-movements"){
   if(!resourceId&&request.method==="GET"){
    const limit=Math.max(1,Math.min(300,Number(url.searchParams.get("limit")||100)));
    const rows=await db.prepare("SELECT * FROM business_cash_movements_v1 WHERE business_id=? AND owner_id=? ORDER BY movement_date DESC,created_at DESC LIMIT ?").bind(businessId,ownerId,limit).all();
    return reply({movements:(rows.results||[]).map(cashMoveOut)},200,corsOrigin);
   }
   if(!resourceId&&request.method==="POST"){
    let x;try{x=await request.json();}catch{return fail("بدنه درخواست معتبر نیست.",400,corsOrigin);}
    const n=normalizeCashMovementInput(x);if(n.error)return fail(n.error,400,corsOrigin);
    const accountId=String(x.cashAccountId||"");if(!idOk(accountId,"cash"))return fail("حساب مالی را انتخاب کن.",400,corsOrigin);
    const account=await db.prepare("SELECT id FROM business_cash_accounts_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='active'").bind(accountId,businessId,ownerId).first();
    if(!account)return fail("حساب مالی فعال این پرونده پیدا نشد.",404,corsOrigin);
    const v=n.value,id="cashmove-"+crypto.randomUUID(),source=v.direction==="in"?"manual_inflow":"manual_outflow";
    const r=await db.prepare("INSERT INTO business_cash_movements_v1(id,business_id,owner_id,cash_account_id,direction,amount_toman,movement_date,source_type,source_id,title,method,reference,notes,status,created_at) VALUES(?,?,?,?,?,?,?,?,'',?,?,?,?,'active',datetime('now'))").bind(id,businessId,ownerId,accountId,v.direction,v.amount_toman,v.movement_date,source,v.title,v.method,v.reference,v.notes).run();
    if(Number(r.meta?.changes||0)!==1)throw new Error("Cash movement insert not confirmed.");
    const row=await db.prepare("SELECT * FROM business_cash_movements_v1 WHERE id=? AND business_id=? AND owner_id=?").bind(id,businessId,ownerId).first();
    return reply({movement:cashMoveOut(row),saved:true},201,corsOrigin);
   }
   if(resourceId&&action==="void"&&request.method==="POST"){
    const r=await db.prepare("UPDATE business_cash_movements_v1 SET status='voided' WHERE id=? AND business_id=? AND owner_id=? AND source_type IN ('manual_inflow','manual_outflow') AND status='active'").bind(resourceId,businessId,ownerId).run();
    if(Number(r.meta?.changes||0)!==1)return fail("فقط گردش دستی فعال قابل ابطال است.",404,corsOrigin);return reply({voided:true},200,corsOrigin);
   }
  }
  if(resource==="expense-payments"){
   if(!resourceId&&request.method==="GET"){
    const rows=await db.prepare("SELECT p.*,t.title AS expense_title,s.name AS supplier_name,a.name AS account_name FROM business_expense_payments_v1 p JOIN business_transactions_v1 t ON t.id=p.transaction_id LEFT JOIN business_suppliers_v1 s ON s.id=p.supplier_id LEFT JOIN business_cash_accounts_v1 a ON a.id=p.cash_account_id WHERE p.business_id=? AND p.owner_id=? ORDER BY p.payment_date DESC,p.created_at DESC LIMIT 300").bind(businessId,ownerId).all();
    return reply({payments:(rows.results||[]).map(r=>({id:r.id,transactionId:r.transaction_id,expenseTitle:r.expense_title,supplierId:r.supplier_id||null,supplierName:r.supplier_name||"",cashAccountId:r.cash_account_id,accountName:r.account_name||"",amountToman:Number(r.amount_toman),paymentDate:r.payment_date,paymentMethod:r.payment_method,reference:r.reference||"",notes:r.notes||"",status:r.status}))},200,corsOrigin);
   }
   if(!resourceId&&request.method==="POST"){
    let x;try{x=await request.json();}catch{return fail("بدنه درخواست معتبر نیست.",400,corsOrigin);}
    const n=normalizeExpensePaymentInput(x);if(n.error)return fail(n.error,400,corsOrigin);const v=n.value;
    const expense=await db.prepare("SELECT id,amount_toman,supplier_id FROM business_transactions_v1 WHERE id=? AND business_id=? AND owner_id=? AND transaction_type='expense'").bind(v.transaction_id,businessId,ownerId).first();
    if(!expense)return fail("هزینه انتخاب‌شده پیدا نشد.",404,corsOrigin);
    const account=await db.prepare("SELECT id FROM business_cash_accounts_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='active'").bind(v.cash_account_id,businessId,ownerId).first();
    if(!account)return fail("حساب پرداخت فعال نیست.",404,corsOrigin);
    if(v.supplier_id){const supplier=await db.prepare("SELECT id FROM business_suppliers_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='active'").bind(v.supplier_id,businessId,ownerId).first();if(!supplier)return fail("تأمین‌کننده فعال این پرونده پیدا نشد.",404,corsOrigin);}
    if(expense.supplier_id&&v.supplier_id&&expense.supplier_id!==v.supplier_id)return fail("این هزینه قبلاً به تأمین‌کننده دیگری متصل شده است.",409,corsOrigin);
    const id="expensepay-"+crypto.randomUUID(),moveId="cashmove-"+crypto.randomUUID();
    const batch=await db.batch([
     db.prepare("INSERT INTO business_expense_payments_v1(id,business_id,owner_id,transaction_id,supplier_id,cash_account_id,amount_toman,payment_date,payment_method,reference,notes,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,'paid',datetime('now'),datetime('now') WHERE (SELECT COALESCE(SUM(amount_toman),0) FROM business_expense_payments_v1 WHERE transaction_id=? AND business_id=? AND owner_id=? AND status='paid')+? <= (SELECT amount_toman FROM business_transactions_v1 WHERE id=? AND business_id=? AND owner_id=? AND transaction_type='expense') AND EXISTS(SELECT 1 FROM business_cash_accounts_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='active')").bind(id,businessId,ownerId,v.transaction_id,v.supplier_id,v.cash_account_id,v.amount_toman,v.payment_date,v.payment_method,v.reference,v.notes,v.transaction_id,businessId,ownerId,v.amount_toman,v.transaction_id,businessId,ownerId,v.cash_account_id,businessId,ownerId),
     db.prepare("INSERT INTO business_cash_movements_v1(id,business_id,owner_id,cash_account_id,direction,amount_toman,movement_date,source_type,source_id,title,method,reference,notes,status,created_at) SELECT ?,?,?,?,'out',?,?,'expense_payment',?,?,?, ?,?,'active',datetime('now') WHERE EXISTS(SELECT 1 FROM business_expense_payments_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='paid')").bind(moveId,businessId,ownerId,v.cash_account_id,v.amount_toman,v.payment_date,id,"پرداخت هزینه",v.payment_method,v.reference,v.notes,id,businessId,ownerId),
     db.prepare("UPDATE business_transactions_v1 SET supplier_id=COALESCE(supplier_id,?) WHERE id=? AND business_id=? AND owner_id=? AND transaction_type='expense' AND (supplier_id IS NULL OR supplier_id=?)").bind(v.supplier_id,v.transaction_id,businessId,ownerId,v.supplier_id)
    ]);
    if(Number(batch?.[0]?.meta?.changes||0)!==1)return fail("مبلغ پرداخت از مانده پرداخت‌نشده هزینه بیشتر است یا هزینه هم‌زمان تغییر کرده؛ پرداخت ثبت نشد.",409,corsOrigin);
    if(Number(batch?.[1]?.meta?.changes||0)!==1)throw new Error("Expense cash movement not confirmed.");
    return reply({paid:true,paymentId:id,cashMovementId:moveId},201,corsOrigin);
   }
   if(resourceId&&action==="void"&&request.method==="POST"){
    if(!idOk(resourceId,"expensepay"))return fail("شناسه پرداخت معتبر نیست.",400,corsOrigin);
    const r=await db.batch([
     db.prepare("UPDATE business_expense_payments_v1 SET status='voided',updated_at=datetime('now') WHERE id=? AND business_id=? AND owner_id=? AND status='paid'").bind(resourceId,businessId,ownerId),
     db.prepare("UPDATE business_cash_movements_v1 SET status='voided' WHERE source_type='expense_payment' AND source_id=? AND business_id=? AND owner_id=? AND status='active'").bind(resourceId,businessId,ownerId)
    ]);
    if(Number(r?.[0]?.meta?.changes||0)!==1)return fail("پرداخت پیدا نشد یا قبلاً باطل شده است.",404,corsOrigin);
    if(Number(r?.[1]?.meta?.changes||0)!==1)throw new Error("Expense payment cash reversal not confirmed.");
    return reply({voided:true},200,corsOrigin);
   }
  }
  return fail("منبع یا روش دفتر مالی پشتیبانی نمی‌شود.",405,corsOrigin);
 }catch(e){console.error("[NAVA BUSINESS LEDGER]",e);return fail("عملیات دفتر مالی انجام نشد؛ اجرای Migration شماره ۰۰۱۱ را بررسی کن.",500,corsOrigin);}
}
