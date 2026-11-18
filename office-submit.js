/* Dedicated Office brief button.
   This file owns only #officeBriefSubmit inside #officeBriefForm. */
(() => {
  const form = document.getElementById("officeBriefForm");
  const button = document.getElementById("officeBriefSubmit");
  const status = document.getElementById("officeSubmitStatus");
  const briefField = document.getElementById("studioBrief-office");
  const setStatus = message => { if (status) status.textContent = message; };

  if (!form || !button || !briefField) {
    console.error("[NAVA Office] Dedicated button setup failed: required Office elements were not found.", {
      form: Boolean(form), button: Boolean(button), briefField: Boolean(briefField)
    });
    setStatus("خطای اتصال دکمه: فرم یا دکمه مخصوص Office پیدا نشد.");
    return;
  }

  let busy = false;
  const runOfficeRequest = async event => {
    event?.preventDefault();
    if (busy) return;

    const completeBrief = String(briefField.value || "").trim();
    const userInstruction = completeBrief
      .replace(/(?:^|\n)\s*--- متن استخراج‌شده از فایل:[\s\S]*?--- پایان متن فایل ---\s*/g, "\n")
      .trim();

    if (!userInstruction) {
      setStatus("شرح درخواست خالی است؛ ابتدا درخواستت را در کادر شرح درخواست بنویس.");
      briefField.focus();
      return;
    }
    if (userInstruction.length > 9000) {
      setStatus("شرح درخواست بیش از حد طولانی است؛ لطفاً آن را کوتاه‌تر کن.");
      briefField.focus();
      return;
    }

    busy = true;
    button.disabled = true;
    setStatus("دکمه مخصوص Office فعال شد؛ در حال آماده‌سازی درخواست...");
    try {
      const fileState = await window.NavaOfficeFile?.waitForReady?.();
      if (fileState?.selected && !fileState.ready) throw new Error("فایل هنوز آماده ارسال نیست.");
      const editorState = await window.NavaOfficeTools?.waitUntilReady?.();
      if (editorState?.selected && !editorState.ready) throw new Error("ویرایشگر فایل هنوز آماده نیست.");
      if (typeof window.sendOfficeNaviRequest !== "function") {
        throw new Error("اتصال اختصاصی Office به NAVI بارگذاری نشده است؛ فایل app.js اجرا نشده.");
      }

      setStatus("درخواست از دکمه اختصاصی Office به NAVI تحویل داده شد...");
      const result = await window.sendOfficeNaviRequest({ message: userInstruction });
      if (result?.reason === "login") {
        setStatus("پنجره ورود NAVI باز شد؛ وارد حساب شو و دوباره همین دکمه را بزن.");
      } else if (result?.reason === "busy") {
        setStatus("NAVI مشغول پاسخ‌گویی به درخواست قبلی است؛ پس از پایان دوباره تلاش کن.");
      } else if (result?.reason === "empty") {
        setStatus("شرح درخواست خالی است؛ ابتدا درخواستت را بنویس.");
      } else {
        setStatus("درخواست از دکمه اختصاصی Office ارسال شد؛ پاسخ را در پنجره NAVI ببین.");
      }
    } catch (error) {
      console.error("[NAVA Office] Dedicated button failed:", error);
      setStatus(error?.message || "ارسال درخواست Office ناموفق بود.");
    } finally {
      busy = false;
      button.disabled = false;
    }
  };

  button.addEventListener("click", runOfficeRequest);
  form.addEventListener("submit", runOfficeRequest);
  form.addEventListener("reset", () => setStatus("فرم پاک شد. درخواست جدیدت را بنویس."));
  button.dataset.officeButtonReady = "true";
  console.info("[NAVA Office] Dedicated #officeBriefSubmit click handler is ready.");
})();