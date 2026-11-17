/* NAVI guided Office onboarding — opens the existing assistant with the active Office brief. */
(() => {
  "use strict";
  const app=document.getElementById("officeGuideApp"),level=document.getElementById("officeGuideLevel"),question=document.getElementById("officeGuideQuestion"),ask=document.getElementById("officeGuideAskNavi"),status=document.getElementById("officeGuideStatus");
  if(!app||!level||!question||!ask)return;
  document.querySelectorAll(".office-guide-preset").forEach(button=>button.addEventListener("click",()=>{
    app.value=button.dataset.app||"عمومی";question.value=button.dataset.question||"";question.focus();
    status.textContent="نمونه درخواست آماده شد؛ می‌توانی آن را تغییر بدهی یا برای ناوی بفرستی.";
  }));
  ask.addEventListener("click",()=>{
    const task=question.value.trim();
    if(!task){status.textContent="اول بنویس در چه کاری کمک می‌خواهی یا یکی از نمونه‌ها را انتخاب کن.";question.focus();return;}
    if(typeof window.openNaviAssistant!=="function"){status.textContent="همراه ناوی هنوز آماده نیست؛ صفحه را تازه‌سازی کن و دوباره تلاش کن.";return;}
    const taskField=document.getElementById("studioTask-office"),operation=document.getElementById("studioMode-office");
    if(taskField)taskField.value="راهنمای انجام یک کار در Word یا Excel یا PowerPoint";
    if(operation)operation.value="guide";
    const context={task:"راهنمایی گام‌به‌گام کاربر در Office",application:app.value,userLevel:level.value,operation:"guide",requestedOutput:"راهنمای متنی و مثال عملی؛ در صورت نیاز فایل پیشنهادی",detailLevel:"متناسب با سطح آشنایی کاربر",brief:task};
    const message="می‌خواهم در بخش Office نوا راهنمایی‌ام کنی. برنامه: "+app.value+". سطح من: "+level.value+". درخواست: "+task+"\n\nلطفاً ابتدا هدفم را روشن کن، سپس ساده و مرحله‌به‌مرحله راهنمایی کن. هر مرحله را کوتاه و قابل اجرا بنویس، اصطلاحات را توضیح بده و برای داده‌ها یا فرمول‌ها مثال واقعی ارائه کن. اگر برای انجام کار به فایل یا اطلاعاتی نیاز داری، دقیق بگو چه چیزی لازم است. هیچ‌وقت ادعا نکن فایل دستگاه من را تغییر داده‌ای مگر اینکه واقعاً خروجی قابل دریافت ساخته شده باشد.";
    window.openNaviAssistant({service:"کارهای اداری و آفیس",context,message});
    status.textContent="درخواست راهنمایی برای ناوی باز شد؛ ادامه گفت‌وگو را در پنجره همراه ناوی انجام بده.";
  });
})();
