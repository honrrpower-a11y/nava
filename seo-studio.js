(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const setText = (node, value) => { if (node) node.textContent = String(value ?? ""); };
  const safeArray = value => Array.isArray(value) ? value : [];
  let auditBusy = false;

  function renderReport(report) {
    const panel = byId("seoAuditResults");
    if (!panel) throw new Error("بخش نمایش گزارش سئو پیدا نشد.");
    const h1 = safeArray(report.h1);
    const findings = safeArray(report.findings);
    panel.hidden = false;
    window.NAVA_SEO_LAST_REPORT = report;
    setText(byId("seoFinalUrl"), report.finalUrl);
    setText(byId("seoTitleValue"), report.title || "ثبت نشده");
    setText(byId("seoDescriptionValue"), report.description || "ثبت نشده");
    setText(byId("seoH1Value"), h1.length ? h1.join(" | ") : "ثبت نشده");
    setText(byId("seoMetrics"), [
      (report.wordCount ?? 0) + " واژه",
      (report.h2Count ?? 0) + " تیتر H2",
      (report.imageCount ?? 0) + " تصویر",
      (report.internalLinks ?? 0) + " لینک داخلی",
      (report.externalLinks ?? 0) + " لینک خارجی"
    ].join(" · "));
    const counts = report.counts || {};
    setText(byId("seoCounts"), "موارد مهم: " + (counts.critical ?? 0) + "  |  نیازمند بازبینی: " +
      (counts.warning ?? 0) + "  |  موارد مناسب: " + (counts.good ?? 0));
    const list = byId("seoFindingList");
    list.replaceChildren();
    findings.forEach(item => {
      const row = document.createElement("article");
      const severity = ["critical", "warning", "good"].includes(item.severity) ? item.severity : "warning";
      row.className = "seo-finding seo-finding--" + severity;
      const heading = document.createElement("strong");
      heading.textContent = item.title || "یافته سئو";
      const detail = document.createElement("p");
      detail.textContent = item.detail || "";
      row.append(heading, detail);
      list.append(row);
    });
    byId("seoDownloadReport").onclick = () => downloadReport(report, findings);
  }

  function downloadReport(report, findings) {
    const lines = [
      "NAVA SEO — گزارش بررسی صفحه", "نشانی: " + report.finalUrl,
      "عنوان: " + (report.title || "ثبت نشده"), "توضیحات: " + (report.description || "ثبت نشده"),
      "H1: " + (safeArray(report.h1).join(" | ") || "ثبت نشده"),
      "واژه‌ها: " + report.wordCount, "تصاویر: " + report.imageCount,
      "تصاویر بدون alt: " + report.imagesMissingAlt, "",
      ...findings.map(item => "[" + item.severity + "] " + item.title + "\n" + item.detail)
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "nava-seo-report.txt"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildNaviRequest(report) {
    const findings = safeArray(report.findings);
    const summary = findings.map(item => "- " + item.title + ": " + item.detail).join("\n");
    const message = [
      "این گزارش واقعی بررسی صفحه من است. بر اساس همین داده‌ها ایرادها را اولویت‌بندی کن و برنامه اصلاح عملی و مرحله‌ای بده.",
      "برای هر اقدام دلیل، اولویت و روش اجرای روشن بنویس. چیزی را که از گزارش قابل تشخیص نیست قطعی اعلام نکن.",
      "", "نشانی صفحه: " + report.finalUrl,
      "عنوان صفحه: " + (report.title || "ثبت نشده"),
      "توضیحات متا: " + (report.description || "ثبت نشده"),
      "تیترهای H1: " + (safeArray(report.h1).join(" | ") || "ثبت نشده"),
      "تعداد واژه‌ها: " + report.wordCount,
      "تعداد تیترهای H2: " + report.h2Count,
      "تعداد تصاویر: " + report.imageCount,
      "تصاویر بدون متن جایگزین: " + report.imagesMissingAlt,
      "لینک‌های داخلی: " + report.internalLinks,
      "لینک‌های خارجی: " + report.externalLinks,
      "", "یافته‌های تحلیل:", summary || "یافته جزئی دیگری ثبت نشده است."
    ].join("\n");
    return {
      message,
      context: {
        task: "اولویت‌بندی گزارش واقعی و تدوین برنامه اصلاح سئو",
        brief: "گزارش صفحه: " + report.finalUrl + "\n" + summary
      }
    };
  }

  async function submitReportToNavi() {
    const report = window.NAVA_SEO_LAST_REPORT;
    const state = byId("seoNaviHandoffState");
    const replyWrap = byId("seoNaviReplyWrap");
    if (!report) return false;
    if (typeof window.navaSeoNaviRequest !== "function") {
      setText(state, "اتصال NAVI بارگذاری نشد.");
      return false;
    }
    const token = window.NAVA_SEO_CONFIG?.getToken?.();
    if (!token) {
      setText(state, "برای ارسال گزارش، ابتدا وارد حساب نوا شو.");
      return false;
    }
    setText(state, "در حال ارسال گزارش به NAVI…");
    setText(byId("seoNaviReply"), "");
    if (replyWrap) replyWrap.hidden = false;
    const request = buildNaviRequest(report);
    try {
      const sent = await window.navaSeoNaviRequest(request);
      if (sent === false) throw new Error("ارسال گزارش به NAVI انجام نشد؛ نشست ورود را بررسی کن.");
      return true;
    } catch (error) {
      setText(state, "ارسال ناموفق");
      setText(byId("seoNaviReply"), error?.message || "ارسال گزارش به NAVI ناموفق بود.");
      return false;
    }
  }

  function init() {
    const form = byId("seoAuditForm");
    if (!form || form.dataset.initialized === "true") return;
    form.dataset.initialized = "true";
    window.addEventListener("nava:seo-status", event => setText(byId("seoNaviHandoffState"), event.detail?.status || ""));
    window.addEventListener("nava:seo-reply", event => {
      setText(byId("seoNaviHandoffState"), "پاسخ NAVI دریافت شد");
      setText(byId("seoNaviReply"), event.detail?.reply || "");
      byId("seoNaviReplyWrap").hidden = false;
    });
    window.addEventListener("nava:seo-error", event => {
      setText(byId("seoNaviHandoffState"), "ارسال ناموفق");
      setText(byId("seoNaviReply"), event.detail?.message || "خطا در ارتباط با NAVI");
      byId("seoNaviReplyWrap").hidden = false;
    });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (auditBusy) return;
      const input = byId("seoAuditUrl");
      const status = byId("seoAuditStatus");
      const button = byId("seoAuditSubmit");
      let value = input.value.trim();
      if (!value) {
        setText(status, "ابتدا آدرس صفحه را وارد کن.");
        input.reportValidity();
        input.focus();
        return;
      }
      // Accept common user input such as example.com without requiring the scheme.
      if (!value.includes("://")) value = "https://" + value;
      input.value = value;
      try {
        const parsedUrl = new URL(value);
        if (!["http:", "https:"].includes(parsedUrl.protocol) || !parsedUrl.hostname.includes(".")) {
          throw new Error("نشانی باید یک آدرس معتبر وب با دامنه کامل باشد.");
        }
      } catch (validationError) {
        setText(status, validationError?.message || "آدرس صفحه معتبر نیست. نمونه: https://example.com/page");
        input.focus();
        return;
      }
      if (!form.reportValidity()) {
        setText(status, "فرمت آدرس صفحه معتبر نیست. نمونه: https://example.com/page");
        input.focus();
        return;
      }
      const config = window.NAVA_SEO_CONFIG;
      const token = config?.getToken?.();
      if (!token) {
        setText(status, "برای اجرای تحلیل، ابتدا وارد حساب نوا شو.");
        window.openNaviAssistant?.({ service: "سئو" });
        return;
      }
      auditBusy = true;
      form.setAttribute("aria-busy", "true");
      button.disabled = true;
      button.querySelector("span").textContent = "در حال تحلیل…";
      setText(byId("seoNaviHandoffState"), "در انتظار ارسال");
      setText(status, "در حال دریافت صفحه و بررسی عناصر واقعی آن…");
      byId("seoAuditResults").hidden = true;
      try {
        let response;
        try {
          response = await fetch(config.apiBase + "/seo-audit", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
            body: JSON.stringify({ url: value }),
            cache: "no-store"
          });
        } catch (networkError) {
          throw new Error("ارتباط با سرویس تحلیل سئو برقرار نشد. اتصال اینترنت یا دسترسی سرویس را بررسی کن.");
        }
        let data;
        try {
          data = await response.json();
        } catch {
          throw new Error("پاسخ سرویس تحلیل سئو قابل‌خواندن نیست (HTTP " + response.status + ").");
        }
        if (!response.ok || !data.success || !data.report) {
          const reason = data?.error || data?.diagnostic || "تحلیل صفحه انجام نشد.";
          throw new Error(reason + " (HTTP " + response.status + (data?.code ? " · " + data.code : "") + ")");
        }
        renderReport(data.report);
        setText(status, "تحلیل فنی کامل شد؛ گزارش در حال ارسال خودکار به NAVI است…");
        await submitReportToNavi();
      } catch (error) {
        setText(status, error?.message || "در اجرای تحلیل خطایی رخ داد.");
        if (byId("seoAuditResults") && !byId("seoAuditResults").hidden && byId("seoNaviHandoffState")?.textContent === "در حال ارسال…") {
          setText(byId("seoNaviHandoffState"), "ارسال ناموفق");
        }
      } finally {
        auditBusy = false;
        form.removeAttribute("aria-busy");
        button.disabled = false;
        button.querySelector("span").textContent = "شروع تحلیل";
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
