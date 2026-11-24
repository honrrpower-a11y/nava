// Validate a small, browser-compressed image for one Gemini request only.
const MAX_INLINE_IMAGE_BASE64 = 1500000;

export function normalizeNaviVisionImage(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ساختار تصویر ارسالی معتبر نیست.");
  }
  if (value.mimeType !== "image/jpeg" || typeof value.data !== "string") {
    throw new Error("فقط تصویر JPEG فشرده‌شده برای تحلیل هوشمند پذیرفته می‌شود.");
  }
  const data = value.data;
  if (!data || data.length > MAX_INLINE_IMAGE_BASE64 ||
      data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new Error("حجم یا کدگذاری تصویر برای تحلیل هوشمند معتبر نیست.");
  }
  return {
    inlineData: {
      mimeType: "image/jpeg",
      data
    }
  };
}
