/* =========================================
   STORY MAKER
========================================= */

const storyInput = document.getElementById("storyInput");
const previewText = document.getElementById("previewText");
const clearStory = document.getElementById("clearStory");
const copyStory = document.getElementById("copyStory");
const storyMessage = document.getElementById("storyMessage");

function bindStoryInput() { storyInput.addEventListener("input", () => {
  const text = storyInput.value.trim();

  previewText.textContent =
    text || "متن استوری تو اینجا نمایش داده می‌شود";

  previewText.classList.toggle("empty", !text);
}); }

function bindStoryClear() { clearStory.addEventListener("click", () => {
  storyInput.value = "";
  previewText.textContent = "متن استوری تو اینجا نمایش داده می‌شود";
  previewText.classList.add("empty");

  storyMessage.textContent = "";
  storyMessage.classList.remove("show");
}); }

function bindStoryCopy() { copyStory.addEventListener("click", async () => {
  const text = storyInput.value.trim();

  if (!text) {
    storyMessage.textContent = "ابتدا متنی برای کپی وارد کن.";
    storyMessage.classList.add("show");
    return;
  }

  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      throw new Error("Clipboard API unavailable");
    }

    await navigator.clipboard.writeText(text);
    storyMessage.textContent = "متن استوری کپی شد.";

  } catch (error) {
    storyMessage.textContent =
      "کپی خودکار در این مرورگر ممکن نیست؛ متن را دستی انتخاب کن.";
  }

  storyMessage.classList.add("show");
}); }

export function initStoryMaker() {
  bindStoryInput();
  bindStoryClear();
  bindStoryCopy();
}
