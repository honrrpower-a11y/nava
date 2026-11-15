/* NAVA BUSINESS — accessible five-tab workspace. */
(() => {
  "use strict";
  const root = document.getElementById("bizPage");
  if (!root) return;
  const tabs = Array.from(root.querySelectorAll("[data-biz-tab]"));
  const panels = Array.from(root.querySelectorAll("[data-biz-panel]"));
  if (!tabs.length || tabs.length !== panels.length) return;

  const storageKey = "nava_business_active_tab";
  const valid = new Set(tabs.map(tab => tab.dataset.bizTab));

  function activate(name, moveFocus) {
    if (!valid.has(name)) name = "dashboard";
    tabs.forEach(tab => {
      const active = tab.dataset.bizTab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
      if (active && moveFocus) tab.focus();
    });
    panels.forEach(panel => {
      const active = panel.dataset.bizPanel === name;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    try { localStorage.setItem(storageKey, name); } catch {}
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab.dataset.bizTab, false));
    tab.addEventListener("keydown", event => {
      let next = index;
      if (event.key === "ArrowLeft") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowRight") next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      activate(tabs[next].dataset.bizTab, true);
    });
  });

  let initial = "dashboard";
  try {
    const saved = localStorage.getItem(storageKey);
    if (valid.has(saved)) initial = saved;
  } catch {}
  activate(initial, false);
})();
