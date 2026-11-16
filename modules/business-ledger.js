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
export function normalizeBusinessPurchaseInput(x){
 if(!x||typeof x!=="object"||Array.isArray(x))return{error:"اطلاعات خرید معتبر نیست."};
 const supplierId=String(x.supplierId||"").trim(),itemId=String(x.itemId||"").trim();
 const quantity=Number(x.quantity),unitPrice=Number(x.unitPriceToman),date=String(x.purchaseDate||"");
 const paid=Number(x.paidAmountToman||0),cashAccountId=String(x.cashAccountId||"").trim();
 const method=String(x.paymentMethod||"");
 if(!idOk(supplierId,"supplier"))return{error:"تأمین‌کننده خرید را انتخاب کن."};
 if(!idOk(itemId,"item"))return{error:"محصول خرید را انتخاب کن."};
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000000)return{error:"تعداد خرید باید عدد صحیح مثبت باشد."};
 if(!Number.isSafeInteger(unitPrice)||unitPrice<1||unitPrice>MAX)return{error:"قیمت واحد خرید باید عدد صحیح مثبت به تومان باشد."};
 const total=quantity*unitPrice;
 if(!Number.isSafeInteger(total)||total<1||total>MAX)return{error:"مبلغ کل خرید از سقف مجاز بیشتر است."};
 if(!validDate(date))return{error:"تاریخ خرید معتبر نیست."};
 if(!Number.isSafeInteger(paid)||paid<0||paid>total)return{error:"مبلغ پرداخت‌شده باید بین صفر و مبلغ کل خرید باشد."};
 if(paid>0&&!idOk(cashAccountId,"cash"))return{error:"برای پرداخت بخشی از خرید، حساب مالی را انتخاب کن."};
 if(paid>0&&!METHODS.has(method))return{error:"روش پرداخت خرید معتبر نیست."};
 return{value:{supplier_id:supplierId,item_id:itemId,quantity,unit_price_toman:unitPrice,total_toman:total,purchase_date:date,paid_amount_toman:paid,cash_account_id:paid?cashAccountId:null,payment_method:paid?method:null,reference:clean(x.reference,120),notes:clean(x.notes,800)}};
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

// Idempotent recovery for production databases where migration 0011 created the schema
// but its final data-seeding statements were not applied. D1 batch is transactional.
export async function ensureBusinessCashLedger(db,businessId,ownerId){
 const accountId="cash-"+crypto.randomUUID();
 await db.batch([
  db.prepare("INSERT INTO business_cash_accounts_v1(id,business_id,owner_id,name,account_type,opening_balance_toman,status,created_at,updated_at) SELECT ?,?,?, 'صندوق اصلی','cash',0,'active',datetime('now'),datetime('now') WHERE NOT EXISTS(SELECT 1 FROM business_cash_accounts_v1 WHERE business_id=? AND owner_id=? AND status='active')").bind(accountId,businessId,ownerId,businessId,ownerId),
  db.prepare("UPDATE business_customer_payments_v1 SET cash_account_id=(SELECT a.id FROM business_cash_accounts_v1 a WHERE a.business_id=business_customer_payments_v1.business_id AND a.owner_id=business_customer_payments_v1.owner_id AND a.status='active' ORDER BY a.created_at,a.id LIMIT 1) WHERE business_id=? AND owner_id=? AND status='received' AND cash_account_id IS NULL").bind(businessId,ownerId),
  db.prepare("INSERT INTO business_cash_movements_v1(id,business_id,owner_id,cash_account_id,direction,amount_toman,movement_date,source_type,source_id,title,method,reference,notes,status,created_at) SELECT 'cashmove-'||lower(hex(randomblob(16))),p.business_id,p.owner_id,p.cash_account_id,'in',p.amount_toman,p.payment_date,'customer_receipt',p.id,'دریافت از مشتری',CASE WHEN p.payment_method IN ('cash','card','bank_transfer','other') THEN p.payment_method ELSE 'other' END,p.reference,p.notes,'active',p.created_at FROM business_customer_payments_v1 p WHERE p.business_id=? AND p.owner_id=? AND p.status='received' AND p.cash_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM business_cash_movements_v1 m WHERE m.source_type='customer_receipt' AND m.source_id=p.id)").bind(businessId,ownerId)
 ]);
}

export async function handleBusinessLedgerRoute({request,env,url,corsOrigin,businessId,ownerId,resource,resourceId="",action=""}){
 try{
  const db=env.NAVA_DB;if(!db)return fail("دیتابیس کسب‌وکار در دسترس نیست.",503,corsOrigin);
  if(!idOk(businessId,"biz")||!await owns(db,businessId,ownerId))return fail("پرونده کسب‌وکار پیدا نشد.",404,corsOrigin);
  await ensureBusinessCashLedger(db,businessId,ownerId);
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
  if(resource==="purchases"){
   if(!resourceId&&request.method==="GET"){
    const rows=await db.prepare("SELECT t.id,t.title,t.amount_toman,t.transaction_date,t.supplier_id,s.name AS supplier_name,m.catalog_item_id,i.name AS item_name,m.quantity_delta,COALESCE(p.paid_toman,0) AS paid_toman FROM business_transactions_v1 t JOIN business_inventory_movements_v1 m ON m.reference_transaction_id=t.id AND m.business_id=t.business_id AND m.owner_id=t.owner_id AND m.movement_type='inbound' JOIN business_catalog_items_v1 i ON i.id=m.catalog_item_id AND i.business_id=m.business_id AND i.owner_id=m.owner_id LEFT JOIN business_suppliers_v1 s ON s.id=t.supplier_id AND s.business_id=t.business_id AND s.owner_id=t.owner_id LEFT JOIN (SELECT transaction_id,SUM(amount_toman) AS paid_toman FROM business_expense_payments_v1 WHERE business_id=? AND owner_id=? AND status='paid' GROUP BY transaction_id) p ON p.transaction_id=t.id WHERE t.business_id=? AND t.owner_id=? AND t.transaction_type='expense' AND t.category='خرید کالا' ORDER BY t.transaction_date DESC,t.created_at DESC LIMIT 100").bind(businessId,ownerId,businessId,ownerId).all();
    return reply({purchases:(rows.results||[]).map(r=>({id:r.id,title:r.title,itemId:r.catalog_item_id,itemName:r.item_name,supplierId:r.supplier_id,supplierName:r.supplier_name||"",quantity:Number(r.quantity_delta),totalToman:Number(r.amount_toman),paidToman:Number(r.paid_toman||0),balanceToman:Number(r.amount_toman)-Number(r.paid_toman||0),purchaseDate:r.transaction_date}))},200,corsOrigin);
   }
   if(!resourceId&&request.method==="POST"){
    let x;try{x=await request.json();}catch{return fail("بدنه درخواست معتبر نیست.",400,corsOrigin);}
    const n=normalizeBusinessPurchaseInput(x);if(n.error)return fail(n.error,400,corsOrigin);const v=n.value;
    const supplier=await db.prepare("SELECT id,name FROM business_suppliers_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='active' LIMIT 1").bind(v.supplier_id,businessId,ownerId).first();
    if(!supplier)return fail("تأمین‌کننده فعال این پرونده پیدا نشد.",404,corsOrigin);
    const item=await db.prepare("SELECT id,name,item_type,track_inventory FROM business_catalog_items_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='active' LIMIT 1").bind(v.item_id,businessId,ownerId).first();
    if(!item||item.item_type!=="product"||Number(item.track_inventory)!==1)return fail("برای خرید، یک محصول فعال با مدیریت موجودی روشن انتخاب کن.",409,corsOrigin);
    if(v.paid_amount_toman>0){
     const account=await db.prepare("SELECT id FROM business_cash_accounts_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='active' LIMIT 1").bind(v.cash_account_id,businessId,ownerId).first();
     if(!account)return fail("حساب مالی فعال برای پرداخت خرید پیدا نشد.",404,corsOrigin);
     const balance=await db.prepare("SELECT a.opening_balance_toman+COALESCE(SUM(CASE WHEN m.status='active' AND m.direction='in' THEN m.amount_toman WHEN m.status='active' AND m.direction='out' THEN -m.amount_toman ELSE 0 END),0) AS balance FROM business_cash_accounts_v1 a LEFT JOIN business_cash_movements_v1 m ON m.cash_account_id=a.id AND m.business_id=a.business_id AND m.owner_id=a.owner_id WHERE a.id=? AND a.business_id=? AND a.owner_id=? AND a.status='active' GROUP BY a.id").bind(v.cash_account_id,businessId,ownerId).first();
     if(!balance||Number(balance.balance)<v.paid_amount_toman)return fail("موجودی حساب برای پرداخت این مبلغ کافی نیست.",409,corsOrigin);
    }
    const transactionId="txn-"+crypto.randomUUID(),movementId="mov-"+crypto.randomUUID();
    const paymentId=v.paid_amount_toman>0?"expensepay-"+crypto.randomUUID():null;
    const cashMovementId=v.paid_amount_toman>0?"cashmove-"+crypto.randomUUID():null;
    const statements=[
     db.prepare("INSERT INTO business_transactions_v1(id,business_id,owner_id,transaction_type,title,amount_toman,transaction_date,category,notes,quantity,unit_price_toman,catalog_item_id,customer_id,supplier_id,created_at,updated_at) SELECT ?,?,?,'expense',?,?,?,'خرید کالا',?,NULL,NULL,NULL,NULL,?,datetime('now'),datetime('now') WHERE EXISTS(SELECT 1 FROM business_suppliers_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='active') AND EXISTS(SELECT 1 FROM business_catalog_items_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='active' AND item_type='product' AND track_inventory=1) AND (?=0 OR (SELECT a.opening_balance_toman+COALESCE(SUM(CASE WHEN m.status='active' AND m.direction='in' THEN m.amount_toman WHEN m.status='active' AND m.direction='out' THEN -m.amount_toman ELSE 0 END),0) FROM business_cash_accounts_v1 a LEFT JOIN business_cash_movements_v1 m ON m.cash_account_id=a.id AND m.business_id=a.business_id AND m.owner_id=a.owner_id WHERE a.id=? AND a.business_id=? AND a.owner_id=? AND a.status='active' GROUP BY a.id)>=?)").bind(transactionId,businessId,ownerId,"خرید "+item.name,v.total_toman,v.purchase_date,v.notes,supplier.id,supplier.id,businessId,ownerId,item.id,businessId,ownerId,v.paid_amount_toman,v.cash_account_id,businessId,ownerId,v.paid_amount_toman),
     db.prepare("INSERT INTO business_inventory_movements_v1(id,business_id,owner_id,catalog_item_id,movement_type,quantity_delta,movement_date,notes,reference_transaction_id,created_at) SELECT ?,?,?,?,'inbound',?,?,?,?,datetime('now') WHERE EXISTS(SELECT 1 FROM business_transactions_v1 WHERE id=? AND business_id=? AND owner_id=?)").bind(movementId,businessId,ownerId,item.id,v.quantity,v.purchase_date,"خرید از "+supplier.name+(v.notes?" · "+v.notes:""),transactionId,transactionId,businessId,ownerId)
    ];
    if(v.paid_amount_toman>0){
     statements.push(
      db.prepare("INSERT INTO business_expense_payments_v1(id,business_id,owner_id,transaction_id,supplier_id,cash_account_id,amount_toman,payment_date,payment_method,reference,notes,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,'paid',datetime('now'),datetime('now') WHERE EXISTS(SELECT 1 FROM business_transactions_v1 WHERE id=? AND business_id=? AND owner_id=?) AND EXISTS(SELECT 1 FROM business_inventory_movements_v1 WHERE id=? AND business_id=? AND owner_id=?)").bind(paymentId,businessId,ownerId,transactionId,supplier.id,v.cash_account_id,v.paid_amount_toman,v.purchase_date,v.payment_method,v.reference,v.notes,transactionId,businessId,ownerId,movementId,businessId,ownerId),
      db.prepare("INSERT INTO business_cash_movements_v1(id,business_id,owner_id,cash_account_id,direction,amount_toman,movement_date,source_type,source_id,title,method,reference,notes,status,created_at) SELECT ?,?,?,?,'out',?,?,'expense_payment',?,'پرداخت خرید "+item.name+"',?,?,?,'active',datetime('now') WHERE EXISTS(SELECT 1 FROM business_expense_payments_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='paid')").bind(cashMovementId,businessId,ownerId,v.cash_account_id,v.paid_amount_toman,v.purchase_date,paymentId,v.payment_method,v.reference,v.notes,paymentId,businessId,ownerId)
     );
    }
    const results=await db.batch(statements);
    if(Number(results?.[0]?.meta?.changes||0)!==1)return fail("خرید ثبت نشد؛ موجودی حساب، تأمین‌کننده یا محصول را دوباره بررسی کن.",409,corsOrigin);
    if(Number(results?.[1]?.meta?.changes||0)!==1)throw new Error("Purchase inventory movement was not confirmed.");
    if(v.paid_amount_toman>0&&Number(results?.[2]?.meta?.changes||0)!==1)return fail("پرداخت خرید ثبت نشد؛ خرید و ورود موجودی نیز ذخیره نشدند.",409,corsOrigin);
    if(v.paid_amount_toman>0&&Number(results?.[3]?.meta?.changes||0)!==1)throw new Error("Purchase cash movement was not confirmed.");
    return reply({saved:true,purchase:{id:transactionId,itemId:item.id,itemName:item.name,supplierId:supplier.id,supplierName:supplier.name,quantity:v.quantity,totalToman:v.total_toman,paidToman:v.paid_amount_toman,balanceToman:v.total_toman-v.paid_amount_toman,purchaseDate:v.purchase_date},stockMovementId:movementId,paymentId,cashMovementId},201,corsOrigin);
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
    const supplierId=v.supplier_id||expense.supplier_id||null;
    const cashBalance=await db.prepare("SELECT a.opening_balance_toman+COALESCE(SUM(CASE WHEN m.status='active' AND m.direction='in' THEN m.amount_toman WHEN m.status='active' AND m.direction='out' THEN -m.amount_toman ELSE 0 END),0) balance FROM business_cash_accounts_v1 a LEFT JOIN business_cash_movements_v1 m ON m.cash_account_id=a.id AND m.business_id=a.business_id AND m.owner_id=a.owner_id WHERE a.id=? AND a.business_id=? AND a.owner_id=? AND a.status='active' GROUP BY a.id").bind(v.cash_account_id,businessId,ownerId).first();
    if(!cashBalance||Number(cashBalance.balance)<v.amount_toman)return fail("موجودی حساب مالی برای این پرداخت کافی نیست.",409,corsOrigin);
    const id="expensepay-"+crypto.randomUUID(),moveId="cashmove-"+crypto.randomUUID();
    const batch=await db.batch([
     db.prepare("INSERT INTO business_expense_payments_v1(id,business_id,owner_id,transaction_id,supplier_id,cash_account_id,amount_toman,payment_date,payment_method,reference,notes,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,'paid',datetime('now'),datetime('now') WHERE (SELECT COALESCE(SUM(amount_toman),0) FROM business_expense_payments_v1 WHERE transaction_id=? AND business_id=? AND owner_id=? AND status='paid')+? <= (SELECT amount_toman FROM business_transactions_v1 WHERE id=? AND business_id=? AND owner_id=? AND transaction_type='expense') AND EXISTS(SELECT 1 FROM business_cash_accounts_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='active')").bind(id,businessId,ownerId,v.transaction_id,supplierId,v.cash_account_id,v.amount_toman,v.payment_date,v.payment_method,v.reference,v.notes,v.transaction_id,businessId,ownerId,v.amount_toman,v.transaction_id,businessId,ownerId,v.cash_account_id,businessId,ownerId),
     db.prepare("INSERT INTO business_cash_movements_v1(id,business_id,owner_id,cash_account_id,direction,amount_toman,movement_date,source_type,source_id,title,method,reference,notes,status,created_at) SELECT ?,?,?,?,'out',?,?,'expense_payment',?,?,?, ?,?,'active',datetime('now') WHERE EXISTS(SELECT 1 FROM business_expense_payments_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='paid')").bind(moveId,businessId,ownerId,v.cash_account_id,v.amount_toman,v.payment_date,id,"پرداخت هزینه",v.payment_method,v.reference,v.notes,id,businessId,ownerId),
     db.prepare("UPDATE business_transactions_v1 SET supplier_id=COALESCE(supplier_id,?) WHERE id=? AND business_id=? AND owner_id=? AND transaction_type='expense' AND (supplier_id IS NULL OR supplier_id=?) AND EXISTS(SELECT 1 FROM business_expense_payments_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='paid')").bind(supplierId,v.transaction_id,businessId,ownerId,supplierId,id,businessId,ownerId)
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
