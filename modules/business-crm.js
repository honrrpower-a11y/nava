// NAVA BUSINESS — customer CRM and draft-to-sale order lifecycle.
import { json, safeNaviText } from "./shared.js";
const clean=(v,n)=>safeNaviText(v??"",n);
const reply=(d,s,o)=>json({success:s<400,...d},s,o);
const fail=(m,s,o)=>reply({error:m},s,o);
const idOk=(v,p)=>new RegExp("^"+p+"-[0-9a-f-]{36}$","i").test(v||"");
const validDate=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||""))return false;const d=new Date(v+"T00:00:00.000Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;};
async function owns(db,b,o){return db.prepare("SELECT id FROM business_profiles_v1 WHERE id=? AND owner_id=? AND status='active' LIMIT 1").bind(b,o).first();}
function customerOut(r){return{id:r.id,name:r.name,phone:r.phone||"",email:r.email||"",address:r.address||"",notes:r.notes||"",status:r.status,createdAt:r.created_at,updatedAt:r.updated_at};}
async function orderOut(db,b,o,id){
 const r=await db.prepare("SELECT o.*,c.name AS customer_name FROM business_orders_v1 o LEFT JOIN business_customers_v1 c ON c.id=o.customer_id WHERE o.id=? AND o.business_id=? AND o.owner_id=?").bind(id,b,o).first();
 if(!r)return null;
 const lines=await db.prepare("SELECT id,catalog_item_id,item_name,quantity,unit_price_toman,line_total_toman FROM business_order_items_v1 WHERE order_id=? AND business_id=? AND owner_id=? ORDER BY created_at,id").bind(id,b,o).all();
 return{id:r.id,customerId:r.customer_id||null,customerName:r.customer_name||"",status:r.status,orderDate:r.order_date,notes:r.notes||"",totalToman:Number(r.total_toman),convertedTransactionId:r.converted_transaction_id||null,items:(lines.results||[]).map(x=>({id:x.id,catalogItemId:x.catalog_item_id||null,itemName:x.item_name,quantity:Number(x.quantity),unitPriceToman:Number(x.unit_price_toman),lineTotalToman:Number(x.line_total_toman)}))};
}
function normalizeCustomer(x,partial=false){
 if(!x||typeof x!=="object"||Array.isArray(x))return{error:"اطلاعات مشتری معتبر نیست."};
 const v={};
 if(!partial||Object.hasOwn(x,"name")){v.name=clean(x.name,120);if(v.name.length<2)return{error:"نام مشتری باید حداقل ۲ نویسه باشد."};}
 for(const[k,n]of [["phone",40],["email",160],["address",500],["notes",1000]])if(!partial||Object.hasOwn(x,k))v[k]=clean(x[k],n);
 if(v.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))return{error:"نشانی ایمیل معتبر نیست."};
 return Object.keys(v).length?{value:v}:{error:"هیچ تغییری ارسال نشده است."};
}
async function normalizeOrder(db,b,o,x){
 if(!x||typeof x!=="object"||Array.isArray(x))return{error:"اطلاعات سفارش معتبر نیست."};
 const customerId=String(x.customerId||"").trim()||null;
 if(customerId){if(!idOk(customerId,"customer"))return{error:"شناسه مشتری معتبر نیست."};const c=await db.prepare("SELECT id FROM business_customers_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='active'").bind(customerId,b,o).first();if(!c)return{error:"مشتری انتخاب‌شده فعال نیست یا متعلق به این پرونده نیست."};}
 const orderDate=String(x.orderDate||"");if(!validDate(orderDate))return{error:"تاریخ سفارش معتبر نیست."};
 if(!Array.isArray(x.items)||!x.items.length||x.items.length>50)return{error:"سفارش باید حداقل یک ردیف و حداکثر ۵۰ ردیف داشته باشد."};
 const items=[],seen=new Set();let total=0;
 for(const raw of x.items){
  if(!raw||typeof raw!=="object")return{error:"یکی از ردیف‌های سفارش معتبر نیست."};
  const catalogItemId=String(raw.catalogItemId||"").trim()||null;
  let itemName=clean(raw.itemName,140),defaultPrice=null;
  if(catalogItemId){
   if(!idOk(catalogItemId,"item")||seen.has(catalogItemId))return{error:"شناسه کاتالوگ نامعتبر است یا یک محصول دوبار در سفارش آمده است."};
   seen.add(catalogItemId);
   const item=await db.prepare("SELECT id,name,status,sale_price_toman FROM business_catalog_items_v1 WHERE id=? AND business_id=? AND owner_id=?").bind(catalogItemId,b,o).first();
   if(!item||item.status!=="active")return{error:"یکی از محصولات یا خدمات انتخاب‌شده فعال نیست."};
   itemName=item.name;defaultPrice=Number(item.sale_price_toman);
  }
  const quantity=Number(raw.quantity);
  const unitPriceToman=raw.unitPriceToman===""||raw.unitPriceToman==null?defaultPrice:Number(raw.unitPriceToman);
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000000||!Number.isSafeInteger(unitPriceToman)||unitPriceToman<1||unitPriceToman>1000000000000)return{error:"تعداد و قیمت هر ردیف باید عدد صحیح مثبت باشد."};
  if(itemName.length<2)return{error:"نام هر ردیف سفارش را وارد کن."};
  const lineTotalToman=quantity*unitPriceToman;if(!Number.isSafeInteger(lineTotalToman)||lineTotalToman>1000000000000)return{error:"مبلغ یکی از ردیف‌ها بیش از حد مجاز است."};
  total+=lineTotalToman;if(!Number.isSafeInteger(total)||total>1000000000000)return{error:"مبلغ کل سفارش بیش از حد مجاز است."};
  items.push({catalog_item_id:catalogItemId,item_name:itemName,quantity,unit_price_toman:unitPriceToman,line_total_toman:lineTotalToman});
 }
 return{value:{customer_id:customerId,order_date:orderDate,notes:clean(x.notes,1200),total_toman:total,items}};
}
export async function handleBusinessCrmRoute({request,env,url,corsOrigin,businessId,ownerId,resource,resourceId="",action=""}){
 try{
  const db=env.NAVA_DB;if(!db)return fail("دیتابیس کسب‌وکار در دسترس نیست.",503,corsOrigin);
  if(!idOk(businessId,"biz")||!await owns(db,businessId,ownerId))return fail("پرونده کسب‌وکار پیدا نشد.",404,corsOrigin);
  if(resource==="customers"){
   if(resourceId&&!idOk(resourceId,"customer"))return fail("شناسه مشتری معتبر نیست.",400,corsOrigin);
   if(!resourceId&&request.method==="GET"){
    const q=clean(url.searchParams.get("q")||"",80),status=url.searchParams.get("status")||"active";
    const clause=status==="all"?"":" AND status=?";
    const args=status==="all"?[businessId,ownerId,"%"+q+"%","%"+q+"%","%"+q+"%"]:[businessId,ownerId,status,"%"+q+"%","%"+q+"%","%"+q+"%"];
    const rows=await db.prepare("SELECT id,name,phone,email,address,notes,status,created_at,updated_at FROM business_customers_v1 WHERE business_id=? AND owner_id=?"+clause+" AND (name LIKE ? OR phone LIKE ? OR email LIKE ?) ORDER BY name COLLATE NOCASE LIMIT 300").bind(...args).all();
    return reply({customers:(rows.results||[]).map(customerOut)},200,corsOrigin);
   }
   if(!resourceId&&request.method==="POST"){
    let x;try{x=await request.json();}catch{return fail("بدنه درخواست معتبر نیست.",400,corsOrigin);}
    const n=normalizeCustomer(x);if(n.error)return fail(n.error,400,corsOrigin);const v=n.value,id="customer-"+crypto.randomUUID();
    const r=await db.prepare("INSERT INTO business_customers_v1(id,business_id,owner_id,name,phone,email,address,notes,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'active',datetime('now'),datetime('now'))").bind(id,businessId,ownerId,v.name,v.phone,v.email,v.address,v.notes).run();
    if(Number(r.meta?.changes||0)!==1)throw new Error("Customer insert not confirmed.");
    const row=await db.prepare("SELECT id,name,phone,email,address,notes,status,created_at,updated_at FROM business_customers_v1 WHERE id=?").bind(id).first();
    return reply({customer:customerOut(row),saved:true},201,corsOrigin);
   }
   if(resourceId&&request.method==="PATCH"){
    let x;try{x=await request.json();}catch{return fail("بدنه درخواست معتبر نیست.",400,corsOrigin);}
    const n=normalizeCustomer(x,true);if(n.error)return fail(n.error,400,corsOrigin);const keys=Object.keys(n.value);
    const r=await db.prepare("UPDATE business_customers_v1 SET "+keys.map(k=>k+"=?").join(",")+",updated_at=datetime('now') WHERE id=? AND business_id=? AND owner_id=? AND status='active'").bind(...keys.map(k=>n.value[k]),resourceId,businessId,ownerId).run();
    if(Number(r.meta?.changes||0)!==1)return fail("مشتری پیدا نشد یا بایگانی شده است.",404,corsOrigin);return reply({updated:true},200,corsOrigin);
   }
   if(resourceId&&request.method==="DELETE"){
    const r=await db.prepare("UPDATE business_customers_v1 SET status='archived',updated_at=datetime('now') WHERE id=? AND business_id=? AND owner_id=? AND status='active'").bind(resourceId,businessId,ownerId).run();
    if(Number(r.meta?.changes||0)!==1)return fail("مشتری پیدا نشد یا قبلاً بایگانی شده است.",404,corsOrigin);return reply({archived:true},200,corsOrigin);
   }
   return fail("روش درخواست برای مشتریان پشتیبانی نمی‌شود.",405,corsOrigin);
  }
  if(resource==="orders"){
   if(resourceId&&!idOk(resourceId,"order"))return fail("شناسه سفارش معتبر نیست.",400,corsOrigin);
   if(!resourceId&&request.method==="GET"){
    const status=url.searchParams.get("status")||"all",clause=status==="all"?"":" AND o.status=?";
    const args=status==="all"?[businessId,ownerId]:[businessId,ownerId,status];
    const rows=await db.prepare("SELECT o.id FROM business_orders_v1 o WHERE o.business_id=? AND o.owner_id=?"+clause+" ORDER BY o.order_date DESC,o.created_at DESC LIMIT 200").bind(...args).all();
    const orders=[];for(const row of rows.results||[])orders.push(await orderOut(db,businessId,ownerId,row.id));
    return reply({orders},200,corsOrigin);
   }
   if(!resourceId&&request.method==="POST"){
    let x;try{x=await request.json();}catch{return fail("بدنه درخواست معتبر نیست.",400,corsOrigin);}
    const n=await normalizeOrder(db,businessId,ownerId,x);if(n.error)return fail(n.error,400,corsOrigin);const v=n.value,id="order-"+crypto.randomUUID();
    const batch=[db.prepare("INSERT INTO business_orders_v1(id,business_id,owner_id,customer_id,status,order_date,notes,total_toman,created_at,updated_at) VALUES(?,?,?,?,'draft',?,?,?,datetime('now'),datetime('now'))").bind(id,businessId,ownerId,v.customer_id,v.order_date,v.notes,v.total_toman),...v.items.map(line=>db.prepare("INSERT INTO business_order_items_v1(id,order_id,business_id,owner_id,catalog_item_id,item_name,quantity,unit_price_toman,line_total_toman,created_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now'))").bind("orderline-"+crypto.randomUUID(),id,businessId,ownerId,line.catalog_item_id,line.item_name,line.quantity,line.unit_price_toman,line.line_total_toman))];
    const r=await db.batch(batch);if(Number(r?.[0]?.meta?.changes||0)!==1)throw new Error("Order insert not confirmed.");return reply({order:await orderOut(db,businessId,ownerId,id),saved:true},201,corsOrigin);
   }
   if(resourceId&&action==="confirm"&&request.method==="POST"){
    const order=await db.prepare("SELECT id,status,total_toman,order_date FROM business_orders_v1 WHERE id=? AND business_id=? AND owner_id=?").bind(resourceId,businessId,ownerId).first();
    if(!order)return fail("سفارش پیدا نشد.",404,corsOrigin);
    if(order.status==="confirmed")return reply({confirmed:true,alreadyConfirmed:true,order:await orderOut(db,businessId,ownerId,resourceId)},200,corsOrigin);
    if(order.status!=="draft")return fail("فقط سفارش پیش‌نویس قابل تأیید است.",409,corsOrigin);
    const inactive=await db.prepare("SELECT oi.id FROM business_order_items_v1 oi LEFT JOIN business_catalog_items_v1 ci ON ci.id=oi.catalog_item_id AND ci.business_id=oi.business_id AND ci.owner_id=oi.owner_id WHERE oi.order_id=? AND oi.business_id=? AND oi.owner_id=? AND oi.catalog_item_id IS NOT NULL AND (ci.id IS NULL OR ci.status<>'active') LIMIT 1").bind(resourceId,businessId,ownerId).first();
    if(inactive)return fail("یکی از محصولات یا خدمات سفارش دیگر فعال نیست؛ سفارش را ویرایش کن.",409,corsOrigin);
    const txn="txn-"+crypto.randomUUID(),title="فروش سفارش "+resourceId.slice(-8);
    const addTxn=db.prepare("INSERT INTO business_transactions_v1(id,business_id,owner_id,transaction_type,title,amount_toman,transaction_date,category,notes,quantity,unit_price_toman,catalog_item_id,created_at,updated_at) SELECT ?,?,?, 'sale',?,?,?,'سفارش','تبدیل سفارش به فروش',NULL,NULL,NULL,datetime('now'),datetime('now') WHERE EXISTS(SELECT 1 FROM business_orders_v1 WHERE id=? AND business_id=? AND owner_id=? AND status='draft') AND NOT EXISTS(SELECT 1 FROM business_order_items_v1 oi JOIN business_catalog_items_v1 ci ON ci.id=oi.catalog_item_id WHERE oi.order_id=? AND oi.business_id=? AND oi.owner_id=? AND ci.status='active' AND ci.item_type='product' AND ci.track_inventory=1 AND (SELECT COALESCE(SUM(m.quantity_delta),0) FROM business_inventory_movements_v1 m WHERE m.catalog_item_id=ci.id AND m.business_id=? AND m.owner_id=?)<oi.quantity)")
      .bind(txn,businessId,ownerId,title,order.total_toman,order.order_date,resourceId,businessId,ownerId,resourceId,businessId,ownerId,businessId,ownerId);
    const addMovements=db.prepare("INSERT INTO business_inventory_movements_v1(id,business_id,owner_id,catalog_item_id,movement_type,quantity_delta,movement_date,notes,reference_transaction_id,created_at) SELECT 'mov-'||lower(hex(randomblob(16))),?,?,oi.catalog_item_id,'sale',-oi.quantity,?,'خروج خودکار بابت تأیید سفارش',?,datetime('now') FROM business_order_items_v1 oi JOIN business_catalog_items_v1 ci ON ci.id=oi.catalog_item_id WHERE oi.order_id=? AND oi.business_id=? AND oi.owner_id=? AND ci.status='active' AND ci.item_type='product' AND ci.track_inventory=1 AND EXISTS(SELECT 1 FROM business_transactions_v1 WHERE id=? AND business_id=? AND owner_id=?)")
      .bind(businessId,ownerId,order.order_date,txn,resourceId,businessId,ownerId,txn,businessId,ownerId);
    const mark=db.prepare("UPDATE business_orders_v1 SET status='confirmed',converted_transaction_id=?,updated_at=datetime('now') WHERE id=? AND business_id=? AND owner_id=? AND status='draft' AND EXISTS(SELECT 1 FROM business_transactions_v1 WHERE id=? AND business_id=? AND owner_id=?)").bind(txn,resourceId,businessId,ownerId,txn,businessId,ownerId);
    const r=await db.batch([addTxn,addMovements,mark]);
    if(Number(r?.[0]?.meta?.changes||0)!==1){const latest=await db.prepare("SELECT status FROM business_orders_v1 WHERE id=? AND business_id=? AND owner_id=?").bind(resourceId,businessId,ownerId).first();if(latest?.status==="confirmed")return reply({confirmed:true,alreadyConfirmed:true,order:await orderOut(db,businessId,ownerId,resourceId)},200,corsOrigin);return fail("موجودی یکی از محصولات کافی نیست یا سفارش هم‌زمان تغییر کرده؛ سفارش تأیید نشد و موجودی کم نشد.",409,corsOrigin);}
    if(Number(r?.[2]?.meta?.changes||0)!==1)throw new Error("Order confirmation update not confirmed.");
    return reply({confirmed:true,transactionId:txn,order:await orderOut(db,businessId,ownerId,resourceId)},200,corsOrigin);
   }
   if(resourceId&&request.method==="PATCH"){
    const current=await db.prepare("SELECT status FROM business_orders_v1 WHERE id=? AND business_id=? AND owner_id=?").bind(resourceId,businessId,ownerId).first();if(!current)return fail("سفارش پیدا نشد.",404,corsOrigin);if(current.status!=="draft")return fail("فقط سفارش پیش‌نویس قابل ویرایش است.",409,corsOrigin);
    let x;try{x=await request.json();}catch{return fail("بدنه درخواست معتبر نیست.",400,corsOrigin);}const n=await normalizeOrder(db,businessId,ownerId,x);if(n.error)return fail(n.error,400,corsOrigin);const v=n.value;
    const batch=[db.prepare("UPDATE business_orders_v1 SET customer_id=?,order_date=?,notes=?,total_toman=?,updated_at=datetime('now') WHERE id=? AND business_id=? AND owner_id=? AND status='draft'").bind(v.customer_id,v.order_date,v.notes,v.total_toman,resourceId,businessId,ownerId),db.prepare("DELETE FROM business_order_items_v1 WHERE order_id=? AND business_id=? AND owner_id=? AND EXISTS(SELECT 1 FROM business_orders_v1 WHERE id=? AND status='draft')").bind(resourceId,businessId,ownerId,resourceId),...v.items.map(line=>db.prepare("INSERT INTO business_order_items_v1(id,order_id,business_id,owner_id,catalog_item_id,item_name,quantity,unit_price_toman,line_total_toman,created_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now'))").bind("orderline-"+crypto.randomUUID(),resourceId,businessId,ownerId,line.catalog_item_id,line.item_name,line.quantity,line.unit_price_toman,line.line_total_toman))];
    await db.batch(batch);return reply({updated:true,order:await orderOut(db,businessId,ownerId,resourceId)},200,corsOrigin);
   }
   if(resourceId&&request.method==="DELETE"){
    const r=await db.prepare("UPDATE business_orders_v1 SET status='cancelled',updated_at=datetime('now') WHERE id=? AND business_id=? AND owner_id=? AND status='draft'").bind(resourceId,businessId,ownerId).run();if(Number(r.meta?.changes||0)!==1)return fail("فقط سفارش پیش‌نویس را می‌توان لغو کرد.",409,corsOrigin);return reply({cancelled:true},200,corsOrigin);
   }
   return fail("روش درخواست برای سفارش‌ها پشتیبانی نمی‌شود.",405,corsOrigin);
  }
  return fail("منبع CRM معتبر نیست.",404,corsOrigin);
 }catch(e){console.error("[NAVA BUSINESS CRM]",e);return fail("عملیات مشتری یا سفارش انجام نشد؛ اجرای Migration شماره ۰۰۰۹ را بررسی کن.",500,corsOrigin);}
}
