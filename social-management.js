(() => {
  const page = document.getElementById("socialPage");
  if (!page) return;

  const platformNames = {
    instagram: "Instagram",
    youtube: "YouTube",
    telegram: "Telegram"
  };

  function activePanel(platform) {
    return page.querySelector('[data-social-panel="' + platform + '"]');
  }

  function switchPlatform(platform) {
    if (!platformNames[platform]) return;
    page.querySelectorAll("[data-social-tab]").forEach(tab => {
      const active = tab.dataset.socialTab === platform;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    page.querySelectorAll("[data-social-panel]").forEach(panel => {
      const active = panel.dataset.socialPanel === platform;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
  }

  function readPanel(platform) {
    const panel = activePanel(platform);
    if (!panel) return null;
    const field = suffix => panel.querySelector('[id$="' + suffix + '"]');
    return {
      platform: platformNames[platform],
      channelName: field("Account")?.value.trim() || "",
      task: panel.querySelector("select")?.selectedOptions?.[0]?.textContent.trim() || "",
      audience: field("Audience")?.value.trim() || "",
      objective: field("Goal")?.value.trim() || "",
      brief: field("Brief")?.value.trim() || ""
    };
  }

  function askNavi(platform) {
    const data = readPanel(platform);
    if (!data || !window.openNaviAssistant) return;
    const details = [
      "شبکه: " + data.platform,
      "نام حساب یا کانال: " + (data.channelName || "مشخص نشده"),
      "درخواست: " + data.task,
      "مخاطب: " + (data.audience || "نیازمند پیشنهاد NAVI"),
      "هدف: " + (data.objective || "نیازمند تعیین هدف"),
      "وضعیت و جزئیات: " + (data.brief || "هنوز توضیحی ثبت نشده است")
    ].join("\n");
    window.openNaviAssistant({
      service: "مدیریت شبکه‌های اجتماعی",
      context: {
        platform: data.platform,
        task: data.task,
        brandName: data.channelName,
        audience: data.audience,
        objective: data.objective,
        brief: details
      },
      message: "در فضای مدیریت " + data.platform + " هستیم. بر اساس اطلاعات زیر درخواست من را مرحله‌به‌مرحله پیش ببر. اگر برای تحلیل یا پیشنهاد دقیق داده‌ای کم است، فقط موارد ضروری را بپرس.\n\n" + details
    });
  }

  function sendToContent(platform) {
    const data = readPanel(platform);
    if (!data) return;
    const platformSelect = document.getElementById("contentPlatform");
    const topic = document.getElementById("contentTopic");
    const audience = document.getElementById("contentAudience");
    if (platformSelect) {
      const option = Array.from(platformSelect.options).find(item =>
        item.textContent.trim().toLowerCase() === data.platform.toLowerCase()
      );
      if (option) platformSelect.value = option.value;
    }
    if (topic && !topic.value.trim()) {
      topic.value = data.brief || data.task;
    }
    if (audience && !audience.value.trim()) audience.value = data.audience;
    if (typeof window.showPage === "function") window.showPage("contentPage");
  }

  page.querySelectorAll("[data-social-tab]").forEach(tab => {
    tab.addEventListener("click", () => switchPlatform(tab.dataset.socialTab));
  });
  page.querySelectorAll("[data-social-submit]").forEach(button => {
    button.addEventListener("click", () => askNavi(button.dataset.socialSubmit));
  });
  page.querySelectorAll("[data-social-content]").forEach(button => {
    button.addEventListener("click", () => sendToContent(button.dataset.socialContent));
  });
})();
