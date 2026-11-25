/* Step-by-step help for the local video editor. Keeps editing/export engines untouched. */
(() => {
"use strict";
const root=document.getElementById("navaVideoEditor");if(!root)return;
const $=id=>root.querySelector("#"+id),toggle=$("navaEditorGuideToggle"),body=$("navaEditorGuideBody"),choices=$("navaEditorGuideChoices"),card=$("navaEditorGuideCard"),controls=$("navaEditorGuideControls"),stepLabel=$("navaEditorGuideStep"),prev=$("navaEditorGuidePrev"),next=$("navaEditorGuideNext");
if(!toggle||!body||!choices||!card||toggle.dataset.ready==="1")return;toggle.dataset.ready="1";
const tasks={
start:{title:"شروع یک پروژه تدوین",steps:[
["ویدئوها را وارد کن","روی «افزودن ویدئوها» بزن و یک یا چند فایل انتخاب کن. فایل‌ها روی همین گوشی پردازش می‌شوند و به سرور آپلود نمی‌شوند.","navaEditorFiles"],
["کلیپ موردنظر را انتخاب کن","از فهرست زمان‌بندی روی نام کلیپ بزن تا انتخاب شود. ابزارهای مربوط به همان کلیپ فعال می‌شوند.","navaEditorTimeline"],
["پیش‌نمایش تدوین را ببین","پخش تدوین را بزن تا کلیپ‌ها به ترتیب پخش شوند. برای بررسی یک نقطه خاص، پخش را متوقف و زمان ویدئو را جابه‌جا کن.","navaEditorPlay"],
["پروژه را خروجی بگیر","وقتی ترتیب و برش‌ها درست شد، نسبت تصویر را انتخاب کن و ساخت ویدئوی نهایی را بزن.","navaEditorExport"]]},
trim:{title:"برش و کوتاه‌کردن یک کلیپ",steps:[
["کلیپ را انتخاب کن","در فهرست زمان‌بندی روی کلیپی که می‌خواهی کوتاه شود بزن.","navaEditorTimeline"],
["ابتدا و انتهای کلیپ را تنظیم کن","دو کنترل ابتدا و انتهای همان کلیپ را جابه‌جا کن. زمان‌ها نسبت به فایل اصلی هستند؛ بخش بین این دو نقطه باقی می‌ماند.","navaEditorTimeline"],
["نتیجه را بررسی کن","پیش‌نمایش را پخش کن. اگر لازم بود دوباره زمان‌های ابتدا و انتها را تنظیم کن.","navaEditorPreview"]]},
split:{title:"تقسیم یک کلیپ به دو بخش",steps:[
["کلیپ را انتخاب کن","روی کلیپ موردنظر در فهرست زمان‌بندی بزن.","navaEditorTimeline"],
["نقطه تقسیم را پیدا کن","در پیش‌نمایش به لحظه‌ای برو که باید کلیپ از آنجا جدا شود؛ سپس پخش را متوقف کن.","navaEditorPreview"],
["تقسیم را اجرا کن","دکمه «تقسیم در زمان فعلی» را بزن. کلیپ به دو بخش قبل و بعد از نقطه انتخابی تبدیل می‌شود.","navaEditorSplitSelected"]]},
music:{title:"افزودن موسیقی به تدوین",steps:[
["فایل موسیقی را انتخاب کن","روی «افزودن موسیقی» بزن و فایل صوتی را از گوشی انتخاب کن.","navaEditorAudio"],
["بلندی موسیقی را تنظیم کن","نوار بلندی موسیقی را کم یا زیاد کن تا با صدای اصلی کلیپ‌ها متعادل شود.","navaEditorAudioVolume"],
["صدا را گوش کن","پخش تدوین را اجرا کن و تعادل صدای موسیقی و صدای کلیپ‌ها را بررسی کن.","navaEditorPlay"]]},
text:{title:"نوشتن متن روی ویدئو",steps:[
["متن را وارد کن","عبارت موردنظرت را در کادر متن بنویس.","navaEditorTextContent"],
["زمان و ظاهر متن را تعیین کن","زمان شروع و پایان، محل نمایش، اندازه، رنگ و افکت ورود متن را تنظیم کن.","navaEditorTextStart"],
["متن را اضافه و بازبینی کن","«افزودن متن به ویدئو» را بزن؛ سپس پخش کن تا زمان‌بندی و ظاهر متن را بررسی کنی.","navaEditorAddText"]]},
export:{title:"ساخت و دریافت ویدئوی نهایی",steps:[
["نسبت تصویر را انتخاب کن","برای یوتیوب افقی ۱۶:۹، برای ریلز و شورتز عمودی ۹:۱۶ و برای پست مربعی ۱:۱ مناسب است.","navaEditorAspectRatio","portrait"],
["خروجی را بساز","ساخت و دانلود ویدئوی نهایی را بزن. هنگام پردازش، صفحه را نبند و مرورگر را در حالت فعال نگه دار.","navaEditorExport"]]}
};
let activeTask=null,activeStep=0;
const focusTool=id=>{const target=$(id);if(!target)return;const label=target.type==="file"?root.querySelector('label[for="'+id+'"]'):null;const visible=label||target;visible.scrollIntoView({behavior:"smooth",block:"center"});if(target.type!=="file"&&target.focus)target.focus({preventScroll:true});};
function render(){
if(!activeTask)return;const task=tasks[activeTask],step=task.steps[activeStep];card.replaceChildren();
const h=document.createElement("strong");h.textContent=task.title+" · "+step[0];
const p=document.createElement("p");p.textContent=step[1];
const actions=document.createElement("div");actions.className="nava-editor-guide-step-actions";
const go=document.createElement("button");go.type="button";go.textContent="رفتن به ابزار مربوط";go.addEventListener("click",()=>focusTool(step[2]));actions.append(go);
if(step[3]==="portrait"){const apply=document.createElement("button");apply.type="button";apply.textContent="اعمال نسبت عمودی ۹:۱۶";apply.addEventListener("click",()=>{if(!window.confirm("نسبت تصویر خروجی روی ۹:۱۶ تنظیم شود؟"))return;const select=$("navaEditorAspectRatio");if(select){select.value="9:16";select.dispatchEvent(new Event("change",{bubbles:true}));focusTool("navaEditorAspectRatio");}});actions.append(apply);}
card.append(h,p,actions);stepLabel.textContent="مرحله "+(activeStep+1)+" از "+task.steps.length;prev.disabled=activeStep===0;next.disabled=activeStep===task.steps.length-1;next.textContent=activeStep===task.steps.length-1?"پایان":"مرحله بعد";controls.hidden=false;
choices.querySelectorAll("[data-guide-task]").forEach(b=>{b.classList.toggle("is-active",b.dataset.guideTask===activeTask);b.setAttribute("aria-pressed",b.dataset.guideTask===activeTask?"true":"false");});
}
toggle.addEventListener("click",()=>{const open=body.hidden;body.hidden=!open;toggle.setAttribute("aria-expanded",open?"true":"false");toggle.textContent=open?"بستن راهنما":"شروع راهنما";});
choices.addEventListener("click",e=>{const b=e.target.closest("[data-guide-task]");if(!b||!tasks[b.dataset.guideTask])return;activeTask=b.dataset.guideTask;activeStep=0;render();});
prev.addEventListener("click",()=>{if(activeStep>0){activeStep--;render();}});
next.addEventListener("click",()=>{const task=tasks[activeTask];if(task&&activeStep<task.steps.length-1){activeStep++;render();}});
})();
