(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const escapeText = value => String(value ?? "");
  const setText = (node, value) => { if (node) node.textContent = escapeText(value); };

  function renderReport(report) {
    window.NAVA_SEO_LAST_REPORT = report;
    const panel = byId("seoAuditResults");
    if (!panel) return;
    panel.hidden = false;
    setText(byId("seoFinalUrl"), report.finalUrl);
    setText(byId("seoTitleValue"), report.title || "ثبت نشده");
    setText(byId("seoDescriptionValue"), report.description || "ثبت نشده");
    setText(byId("seoH1Value"), report.h1.length ? report.h1.join(" | ") : "ثبت نشده");
    setText(byId("seoMetrics"), report.wordCount + " واژه · " + report.h2Count + " تیتر H2 · " +
      report.imageCount + " تصویر · " + report.internalLinks + " لینک داخلی · " + report.externalLinks + " لینک خارجی");
    setText(byId("seoCounts"), "موارد مهم: " + report.counts.critical + " · نیازمند بازبینی: " +
      report.counts.warning + " · موارد مناسب: " + report.counts.good);
    const list = byId("seoFindingList");
    list.replaceChildren();
    report.findings.forEach(item => {
      const row = document.createElement("article");
      row.className = "seo-finding seo-finding--" + item.severity;
      const heading = document.createElement("strong");
      heading.textContent = item.title;
      const detail = document.createElement("p");
      detail.textContent = item.detail;
      row.append(heading, detail);
      list.append(row);
    });
    byId("seoDiscussWithNavi").onclick = () => {
      const summary = report.findings.map(item => "- " + item.title + ": " + item.detail).join("\n");
      window.openNaviAssistant?.({
        service: "سئو",
        context: { pageUrl: report.finalUrl, pageTitle: report.title, metaDescription: report.description, h1: report.h1, wordCount: report.wordCount, findings: report.findings },
        message: "این گزارش واقعی بررسی صفحه من است. بر اساس آن، ایرادها را اولویت‌بندی کن و یک برنامه اصلاح عملی و مرحله‌ای ارائه بده. مواردی را که از این گزارش قابل نتیجه‌گیری نیستند، قطعی اعلام نکن.\n\n" + summary
      });
    };
    byId("seoDownloadReport").onclick = () => {
      const lines = [
        "NAVA SEO — گزارش بررسی صفحه", "نشانی: " + report.finalUrl,
        "عنوان: " + (report.title || "ثبت نشده"), "توضیحات: " + (report.description || "ثبت نشده"),
        "H1: " + (report.h1.join(" | ") || "ثبت نشده"),
        "واژه‌ها: " + report.wordCount, "تصاویر: " + report.imageCount,
        "تصاویر بدون alt: " + report.imagesMissingAlt, "",
        ...report.findings.map(item => "[" + item.severity + "] " + item.title + "\n" + item.detail)
      ];
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "nava-seo-report.txt"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }

  function init() {
    const form = byId("seoAuditForm");
    if (!form) return;
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const input = byId("seoAuditUrl");
      const status = byId("seoAuditStatus");
      const button = byId("seoAuditSubmit");
      const value = input.value.trim();
      if (!value) { setText(status, "ابتدا نشانی صفحه را وارد کن."); return; }
      const config = window.NAVA_SEO_CONFIG;
      const token = config?.getToken?.();
      if (!token) {
        setText(status, "برای اجرای تحلیل، ابتدا وارد حساب نوا شو.");
        window.openNaviAssistant?.({ service: "سئو" });
        return;
      }
      button.disabled = true;
      setText(status, "در حال دریافت صفحه و بررسی عناصر واقعی آن…");
      byId("seoAuditResults").hidden = true;
      try {
        const response = await fetch(config.apiBase + "/seo-audit", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
          body: JSON.stringify({ url: value }),
          cache: "no-store"
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "تحلیل صفحه انجام نشد.");
        renderReport(data.report);
        setText(status, "بررسی صفحه تمام شد. زمان بررسی: " + new Date(data.checkedAt).toLocaleString("fa-IR"));
      } catch (error) {
        setText(status, error.message || "اتصال به سرویس تحلیل برقرار نشد.");
      } finally { button.disabled = false; }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();