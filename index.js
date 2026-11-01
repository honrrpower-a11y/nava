
const ALLOWED_ORIGIN = "https://honrrpower-a11y.github.io";

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store"
    }
  });
}

// استخراج متن پاسخ مدل
function extractText(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map(part => typeof part === "string" ? part : part.text || "")
      .join("")
      .trim();
  }

  return "";
}

// حذف بخش تفکر احتمالی مدل Qwen
function cleanLyrics(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsOrigin =
      origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "*";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    const url = new URL(request.url);

    // ==========================================
    // ۱. ساخت شعر با Gemini و پشتیبان OpenRouter
    // ==========================================

    if (
      url.pathname === "/generate-lyrics" &&
      request.method === "POST"
    ) {
      let input;

      try {
        input = await request.json();
      } catch {
        return json(
          { error: "اطلاعات ارسالی نامعتبر است." },
          400,
          corsOrigin
        );
      }

      const topic = String(input.topic || "").trim();
      const style = String(input.style || "پاپ").trim();
      const language = String(input.language || "fa").trim();

      if (!topic) {
        return json(
          { error: "موضوع شعر نمی‌تواند خالی باشد." },
          400,
          corsOrigin
        );
      }

      const prompt = `
تو یک ترانه‌سرای حرفه‌ای و خلاق هستی که برای خوانندگان و آهنگسازان ترانه می‌نویسی.
ترانه‌ای خلق کن که از نظر ادبی، احساسی و موسیقایی کیفیت بالایی داشته باشد و قابلیت تبدیل شدن به یک آهنگ واقعی و شنیدنی را داشته باشد.

مشخصات:
موضوع: ${topic}
سبک موسیقی: ${style}
زبان: ${language}

اصول اصلی ترانه‌سرایی:

1. داستان و مفهوم:
- ترانه باید یک موضوع مرکزی و مشخص داشته باشد.
- از ابتدا تا انتها یک داستان یا مسیر احساسی منسجم را دنبال کند.
- هر بند باید اطلاعات، احساس یا تصویر تازه‌ای به داستان اضافه کند.
- از تکرار یک مفهوم با کلمات متفاوت خودداری کن.

2. زبان و بیان:
- از زبانی طبیعی، روان، زنده و قابل فهم استفاده کن.
- در ترانه فارسی، از فارسی امروزی و خوش‌آهنگ استفاده کن.
- جمله‌ها باید هنگام خواندن با صدای بلند طبیعی به نظر برسند.
- از ترکیب‌های نامأنوس، جمله‌های ناقص و عبارت‌های بی‌معنی پرهیز کن.
- هیچ کلمه‌ای را فقط برای تکمیل قافیه وارد شعر نکن.
- از ترجمه تحت‌اللفظی و ساختارهای مصنوعی دوری کن.

3. قافیه و وزن:
- قافیه‌ها باید طبیعی و گوش‌نواز باشند.
- در هر بخش، تا حد امکان الگوی قافیه مشخص و هماهنگ داشته باش.
- طول سطرهای یک بخش باید برای اجرای موسیقایی مناسب و نسبتاً هماهنگ باشد.
- از کش دادن بی‌دلیل جمله‌ها برای جور شدن قافیه پرهیز کن.
- روانی و معنای درست را به قافیه اجباری ترجیح بده.

4. تصویرسازی و خلاقیت:
- از تصاویر ملموس، جزئیات واقعی و تشبیه‌های تازه استفاده کن.
- به جای کلیشه‌های تکراری، احساس را با موقعیت و تصویر منتقل کن.
- از عبارت‌های مصرف‌شده مثل قلب شکسته، شب تاریک، اشک پنهان و آسمان بی‌انتها بی‌دلیل استفاده کن.
- خلاقیت باید در خدمت مفهوم باشد، نه صرفاً بازی با کلمات.

5. ترجیع‌بند (Chorus):
- ترجیع‌بند مهم‌ترین و به‌یادماندنی‌ترین بخش ترانه باشد.
- یک جمله محوری و خاص داشته باشد که به راحتی در ذهن بماند.
- از نظر احساسی قدرتمند و از نظر کلامی ساده و قابل زمزمه باشد.
- از جملات طولانی و پیچیده در ترجیع‌بند خودداری کن.

6. هماهنگی با سبک موسیقی:
- لحن، واژگان، ریتم و فضای احساسی را متناسب با سبک انتخاب‌شده تنظیم کن.
- ترانه پاپ، سنتی، رپ، راک و سایر سبک‌ها نباید ساختار و لحن یکسان داشته باشند.
- اگر سبک شاد است، متن نباید ناخواسته غمگین شود.
- اگر سبک عاشقانه یا غمگین است، احساس باید باورپذیر باشد.

7. ساختار ترانه:

[Verse 1]
معرفی موضوع، شخصیت یا موقعیت داستان.

[Pre-Chorus]
افزایش تدریجی احساس و آماده‌سازی برای ترجیع‌بند.

[Chorus]
پیام اصلی، جمله محوری و بخش به‌یادماندنی.

[Verse 2]
ادامه داستان با جزئیات و تصاویر جدید، بدون تکرار بند اول.

[Bridge]
یک تغییر احساسی، کشف تازه یا نگاه متفاوت به موضوع.

[Final Chorus]
بازگشت به ترجیع‌بند با همان متن اصلی.

8. کنترل کیفیت نهایی:
قبل از ارائه ترانه، متن را از نظر خودت بررسی و اصلاح کن:
- آیا تمام جمله‌ها معنی روشن دارند؟
- آیا کلمات در فارسی طبیعی هستند؟
- آیا قافیه‌ها تصنعی نشده‌اند؟
- آیا سطرها قابلیت خوانده شدن روی موسیقی را دارند؟
- آیا ترجیع‌بند جذاب و ماندگار است؟
- آیا هیچ سطر تکراری یا بی‌هدف وجود دارد؟

اگر جمله‌ای ضعیف یا نامأنوس است، آن را بازنویسی کن.

قوانین خروجی:
- مستقیماً با [Verse 1] شروع کن.
- فقط متن نهایی ترانه را بنویس.
- هیچ مقدمه، توضیح، تحلیل یا عنوان اضافی ننویس.
- از ایموجی و شماره‌گذاری استفاده نکن.
- ساختار بخش‌ها را دقیقاً حفظ کن.
- ترانه کامل، منسجم و باکیفیت باشد.
- کیفیت را به طولانی بودن ترجیح بده.
`;

      let geminiError = "";

      // ------------------------------------------
      // مرحله اول: تلاش برای ساخت شعر
      // ------------------------------------------

      if (env.GEMINI_API_KEY) {
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`,
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
                ]
              })
            }
          );

          const data = await geminiRes.json();

          if (geminiRes.ok) {
            const lyrics = extractText(
              data.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("")
            );

            if (lyrics) {
              return json(
                {
                  success: true,
                  lyrics,
                  provider: "Gemini"
                },
                200,
                corsOrigin
              );
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

      // ------------------------------------------
      // مرحله دوم: پشتیبان OpenRouter
      // ------------------------------------------

      if (!env.OPENROUTER_API_KEY) {
        return json(
          {
            error: "ساخت شعر با Gemini ناموفق بود و کلید OpenRouter نیز تنظیم نشده است.",
            geminiError
          },
          502,
          corsOrigin
        );
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
              max_tokens: 1800,
              stream: false
            })
          }
        );

        const rawText = await routerRes.text();

        let routerData;

        try {
          routerData = JSON.parse(rawText);
        } catch {
          return json(
            {
              error: "پاسخ OpenRouter قابل پردازش نیست.",
              geminiError,
              routerStatus: routerRes.status
            },
            502,
            corsOrigin
          );
        }

        if (!routerRes.ok || routerData.error) {
          return json(
            {
              error: "ساخت شعر با هر دو سرویس ناموفق بود.",
              geminiError,
              openRouterError:
                routerData.error?.message ||
                `خطای OpenRouter با کد ${routerRes.status}`
            },
            502,
            corsOrigin
          );
        }

        let lyrics = extractText(
          routerData.choices?.[0]?.message?.content
        );

        lyrics = cleanLyrics(lyrics);

        if (!lyrics) {
          return json(
            {
              error: "OpenRouter هم متن معتبری تولید نکرد.",
              geminiError
            },
            502,
            corsOrigin
          );
        }

        return json(
          {
            success: true,
            lyrics,
            provider: "OpenRouter - Qwen3 8B"
          },
          200,
          corsOrigin
        );

      } catch (e) {
        return json(
          {
            error: "ارتباط با هر دو سرویس ساخت شعر ناموفق بود.",
            geminiError,
            openRouterError: e.message
          },
          502,
          corsOrigin
        );
      }
    }

    // ==========================================
    // ۲. مسیر ساخت آهنگ با Ace Music
    // ==========================================

    if (
      url.pathname === "/generate-music" &&
      request.method === "POST"
    ) {
      const apiKey = env.ACEMUSIC_API_KEY;

      if (!apiKey) {
        return json(
          { error: "کلید ACEMUSIC_API_KEY تنظیم نشده است." },
          500,
          corsOrigin
        );
      }

      let input;

      try {
        input = await request.json();
      } catch {
        return json(
          { error: "فرمت اطلاعات ارسالی نامعتبر است." },
          400,
          corsOrigin
        );
      }

      const lyrics = String(
        input.lyrics || input.topic || "Test song"
      ).trim();

      const body = {
        model: "acemusic/acestep-v1.5-turbo",
        messages: [
          {
            role: "user",
            content: `<lyrics>\n${lyrics}\n</lyrics>`
          }
        ],
        stream: false,
        audio_config: {
          format: "mp3",
          duration: 30,
          vocal_language: "fa",
          instrumental: false
        }
      };

      try {
        const res = await fetch(
          "https://api.acemusic.ai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          }
        );

        const rawText = await res.text();

        let data;

        try {
          data = JSON.parse(rawText);
        } catch {
          return json(
            {
              error: "پاسخ سرور Ace Music غیرقابل پردازش است.",
              rawResponse: rawText,
              status: res.status
            },
            500,
            corsOrigin
          );
        }

        // نمایش جزئیات واقعی خطای Ace Music
        if (!res.ok) {
          const errorDetails =
            data.error?.message ||
            data.error?.detail ||
            data.message ||
            JSON.stringify(data);

          return json(
            {
              error: `خطای Ace Music (${res.status})`,
              details: errorDetails,
              status: res.status
            },
            500,
            corsOrigin
          );
        }

        const audioUrl =
          data.choices?.[0]?.message?.audio?.[0]?.audio_url?.url;

        if (!audioUrl) {
          return json(
            {
              error: "پاسخ دریافت شد اما لینک فایل صوتی در آن نبود.",
              raw: data
            },
            502,
            corsOrigin
          );
        }

        return json(
          {
            success: true,
            audioUrl
          },
          200,
          corsOrigin
        );

      } catch (e) {
        return json(
          {
            error: "خطای پردازش در ارتباط با سرور موزیک",
            details: e.message
          },
          500,
          corsOrigin
        );
      }
    }

    return json(
      { error: "Not found" },
      404,
      corsOrigin
    );
  }
};
