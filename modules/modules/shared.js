// توابع عمومی و مشترک نوا
export function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Nava-Test-Token, Authorization",
      "Cache-Control": "no-store",
      "Vary": "Origin"
    }
  });
}

export function extractText(content) {
  if (typeof content === "string") return content.trim();

  if (Array.isArray(content)) {
    return content.map(part =>
      typeof part === "string" ? part : part?.text || ""
    ).join("").trim();
  }

  return "";
}

export function cleanLyrics(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function safeText(value, maxLength = 1000) {
  return String(value ?? "")
    .replace(/<\/?(?:prompt|lyrics)\b[^>]*>/gi, "")
    .replace(/[<>]/g, "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

export function safeNaviText(value, maxLength = 3000) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function normalizePersianSpacing(text) {
  return String(text || "").replace(
    /([\u0621-\u06A9]{2,})ه(ای|ام|ات|اش|ایم|اید|اند)(?=[\s،؛.!؟,:]|$)/g,
    "$1ه $2"
  );
}

export function cleanPersianLatinMix(text, language = "fa") {
  let result = String(text || "");

  if (language !== "fa") return result;

  result = result.replace(
    /([\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF])([A-Za-z]{1,12})(?=$|[\s،؛,.!?؟:])/g,
    "$1"
  );

  result = result.replace(/[ \t]{2,}/g, " ");
  result = result.replace(/\s+([،؛.!؟,:])/g, "$1");

  return result.trim();
}

export function prepareLyrics(text, language = "fa") {
  let result = String(text || "");
  result = normalizePersianSpacing(result);
  result = cleanPersianLatinMix(result, language);
  return result.trim();
}

// ==========================================
// تبدیل فایل صوتی به Base64
// ==========================================
