// موتور تولید شعر نوا
import { GEMINI_MODEL } from "./config.js";
import { json, extractText, safeText, prepareLyrics, cleanLyrics } from "./shared.js";

function parseLyricsOutput(rawText, language = "fa") {
  const cleaned = cleanLyrics(rawText);
  let parsed = null;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(
          cleaned.slice(firstBrace, lastBrace + 1)
        );
      } catch {
        parsed = null;
      }
    }
  }

  let lyrics = "";
  let singingLyrics = "";

  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed)
  ) {
    lyrics = extractText(
      parsed.lyrics ||
      parsed.originalLyrics ||
      parsed.original
    );

    singingLyrics = extractText(
      parsed.singingLyrics ||
      parsed.singing_lyrics ||
      parsed.pronunciationLyrics
    );
  }

  if (!lyrics) lyrics = cleaned;

  lyrics = prepareLyrics(lyrics, language);

  singingLyrics = singingLyrics
    ? prepareLyrics(singingLyrics, language)
    : lyrics;

  return {
    lyrics: lyrics.trim(),
    singingLyrics: singingLyrics.trim()
  };
}

// ==========================================
// پرامپت ساخت شعر
// ==========================================

function buildLyricsPrompt(topic, style, language) {
  return `
تو یک ترانه‌سرای حرفه‌ای، خلاق و مسلط به ترانه‌سرایی موسیقایی هستی.

برای موضوع زیر یک ترانه کامل، منسجم، احساسی و قابل اجرا بساز.

موضوع: ${topic}
سبک و حال‌وهوا: ${style}
زبان: ${language}

اصول ترانه‌سرایی:

۱. ترانه باید موضوع مرکزی مشخص و مسیر احساسی منسجم داشته باشد.
۲. هر بند تصویر یا احساس تازه‌ای اضافه کند.
۳. از کلیشه‌ها و تکرار بی‌هدف دوری کن.
۴. زبان طبیعی، روان و زنده باشد.
۵. جمله‌ها هنگام خواندن با صدای بلند طبیعی باشند.
۶. قافیه‌ها طبیعی باشند و به زور وارد شعر نشوند.
۷. طول سطرها برای اجرای موسیقایی مناسب باشد.
۸. ترجیع‌بند باید ساده، قدرتمند و به‌یادماندنی باشد.

ساختار:

[Verse 1]
معرفی موضوع و موقعیت.

[Pre-Chorus]
افزایش تدریجی احساس.

[Chorus]
پیام اصلی و بخش ماندگار.

[Verse 2]
ادامه داستان با تصاویر تازه.

[Bridge]
تغییر احساسی یا نگاه متفاوت.

[Final Chorus]
بازگشت به ترجیع‌بند با همان متن اصلی.

قوانین ویژه زبان فارسی:

اگر زبان فارسی است:

- فقط از حروف و واژه‌های فارسی برای متن فارسی استفاده کن.
- حروف لاتین را به انتهای کلمات فارسی نچسبان.
- از ترکیب تصادفی حروف فارسی و لاتین خودداری کن.
- فارسی طبیعی و خوش‌آهنگ باشد.
- کلمات انگلیسی فقط در صورت استفاده عمدی و مستقل مجازند.

دو نسخه هماهنگ بساز:

نسخه lyrics:
متن خوانا و طبیعی، بدون اعراب‌گذاری اضافی.

نسخه singingLyrics:
دقیقاً همان شعر و همان کلمات نسخه اول.
فقط کلمات دشوار یا چندخوانشی را با اعراب لازم مشخص کن.
هیچ کلمه یا سطری را تغییر نده، حذف نکن یا اضافه نکن.

جدانویسی ه غیرملفوظ:

کافه ای
خانه ام
پنجره ات
خسته ام
قصه ام

اگر زبان ترکی یا انگلیسی است، هر دو نسخه از نظر متن یکسان باشند.

قوانین خروجی:

فقط JSON معتبر برگردان.
هیچ توضیحی بیرون از JSON ننویس.
از Markdown و کدبلاک استفاده نکن.

ساختار دقیق:

{
  "lyrics": "متن کامل شعر اصلی",
  "singingLyrics": "همان شعر با اعراب‌گذاری انتخابی"
}

تمام خطوط شعر و برچسب‌های بخش‌ها را در هر دو نسخه حفظ کن.
`;
}

// ==========================================
// پروفایل‌های موسیقی
// ==========================================

export async function handleLyricsRoute({ request, env, url, corsOrigin }) {
    // ۱. تولید شعر
    // ======================================

    if (
      url.pathname === "/generate-lyrics" &&
      request.method === "POST"
    ) {
      let input;

      try {
        input = await request.json();
      } catch {
        return json({
          error: "اطلاعات ارسالی نامعتبر است."
        }, 400, corsOrigin);
      }

      const topic = safeText(input.topic || "", 500);
      const style = safeText(input.style || "پاپ", 100);

      const language = ["fa", "tr", "en"].includes(input.language)
        ? input.language
        : "fa";

      if (!topic) {
        return json({
          error: "موضوع شعر نمی‌تواند خالی باشد."
        }, 400, corsOrigin);
      }

      const prompt = buildLyricsPrompt(
        topic,
        style,
        language
      );

      let geminiError = "";

      // Gemini
      if (env.GEMINI_API_KEY) {
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [{ text: prompt }]
                  }
                ],
                generationConfig: {
                  temperature: 0.85,
                  maxOutputTokens: 3000,
                  responseMimeType: "application/json"
                }
              })
            }
          );

          const data = await geminiRes.json();

          if (geminiRes.ok) {
            const rawLyrics = extractText(
              data.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("")
            );

            const result = parseLyricsOutput(
              rawLyrics,
              language
            );

            if (result.lyrics) {
              return json({
                success: true,
                lyrics: result.lyrics,
                singingLyrics: result.singingLyrics,
                provider: "Gemini"
              }, 200, corsOrigin);
            }

            geminiError = "جمنای متن معتبری تولید نکرد.";

          } else {
            geminiError =
              data.error?.message ||
              `خطای Gemini با کد ${geminiRes.status}`;
          }

        } catch (e) {
          geminiError = e.message || "خطای ارتباط با Gemini";
        }

      } else {
        geminiError = "کلید GEMINI_API_KEY تنظیم نشده است.";
      }

      // OpenRouter fallback
      if (!env.OPENROUTER_API_KEY) {
        return json({
          error:
            "ساخت شعر با Gemini ناموفق بود و کلید OpenRouter نیز تنظیم نشده است.",
          geminiError
        }, 502, corsOrigin);
      }

      try {
        const routerRes = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://honrrpower-a11y.github.io/nava/",
              "X-OpenRouter-Title": "Nava AI"
            },
            body: JSON.stringify({
              model: "qwen/qwen3-8b:free",
              messages: [
                {
                  role: "user",
                  content: prompt
                }
              ],
              temperature: 0.85,
              max_tokens: 3000,
              stream: false
            })
          }
        );

        const rawText = await routerRes.text();
        let routerData;

        try {
          routerData = JSON.parse(rawText);
        } catch {
          return json({
            error: "پاسخ OpenRouter قابل پردازش نیست.",
            geminiError,
            routerStatus: routerRes.status
          }, 502, corsOrigin);
        }

        if (!routerRes.ok || routerData.error) {
          return json({
            error: "ساخت شعر با هر دو سرویس ناموفق بود.",
            geminiError,
            openRouterError:
              routerData.error?.message ||
              `خطای OpenRouter با کد ${routerRes.status}`
          }, 502, corsOrigin);
        }

        const rawLyrics = extractText(
          routerData.choices?.[0]?.message?.content
        );

        const result = parseLyricsOutput(
          rawLyrics,
          language
        );

        if (!result.lyrics) {
          return json({
            error: "OpenRouter هم متن معتبری تولید نکرد.",
            geminiError
          }, 502, corsOrigin);
        }

        return json({
          success: true,
          lyrics: result.lyrics,
          singingLyrics: result.singingLyrics,
          provider: "OpenRouter - Qwen3 8B"
        }, 200, corsOrigin);

      } catch (e) {
        return json({
          error: "ارتباط با سرویس ساخت شعر ناموفق بود.",
          geminiError,
          openRouterError: e.message
        }, 502, corsOrigin);
      }
    }

  return null;
}
