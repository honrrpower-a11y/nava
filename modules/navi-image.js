// Validate a small, browser-compressed image for one Gemini request only.
const MAX_INLINE_IMAGE_BASE64 = 1500000;

export function normalizeNaviVisionImages(values) {
  if (values === undefined || values === null) return [];
  if (!Array.isArray(values) || values.length > 6) throw new Error("برای تحلیل هم‌زمان حداکثر ۶ تصویر پذیرفته می‌شود.");
  const normalized = values.map(normalizeNaviVisionImage);
  if (normalized.some(item => !item)) throw new Error("یکی از تصاویر ارسالی خالی یا نامعتبر است.");
  const totalBase64Chars = normalized.reduce((sum, item) => sum + item.inlineData.data.length, 0);
  if (totalBase64Chars > 9000000) throw new Error("حجم مجموع تصاویر برای تحلیل هم‌زمان بیش از حد مجاز است؛ تصاویر کم‌حجم‌تری انتخاب کن.");
  return normalized;
}

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
