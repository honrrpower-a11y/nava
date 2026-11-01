
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsOrigin = origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "*";

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

    // ۱. مسیر ساخت شعر
    if (url.pathname === "/generate-lyrics" && request.method === "POST") {
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return json({ error: "کلید GEMINI_API_KEY تنظیم نشده است." }, 500, corsOrigin);
      }

      let input;
      try {
        input = await request.json();
      } catch {
        return json({ error: "اطلاعات ارسالی نامعتبر است." }, 400, corsOrigin);
      }

      const topic = String(input.topic || "").trim();
      const style = String(input.style || "پاپ").trim();
      const language = String(input.language || "fa").trim();

      if (!topic) {
        return json({ error: "موضوع شعر نمی‌تواند خالی باشد." }, 400, corsOrigin);
      }

      
const prompt = `
تو یک ترانه‌سرای حرفه‌ای، خلاق و باتجربه هستی.
وظیفه تو نوشتن ترانه‌هایی است که قابلیت تبدیل شدن به آهنگ واقعی و ماندگار را داشته باشند.

مشخصات ترانه:
موضوع: ${topic}
سبک موسیقی: ${style}
زبان: ${language}

قوانین مهم ترانه‌سرایی:

1. قبل از نوشتن، برای خودت یک داستان یا خط احساسی مشخص طراحی کن.
ترانه باید شروع، پیشرفت احساسی و پایان داشته باشد.
هر بخش باید ادامه طبیعی بخش قبلی باشد.

2. از قافیه‌های طبیعی، دقیق و گوش‌نواز استفاده کن.
قافیه نباید باعث خراب شدن معنی یا غیرطبیعی شدن جمله شود.

3. وزن و طول سطرها را تا حد امکان هماهنگ نگه دار.
جملات باید روان باشند و هنگام خواندن روی موسیقی به راحتی اجرا شوند.

4. از عبارت‌های کلیشه‌ای و تکراری هوش مصنوعی دوری کن.
از ترکیب‌های بیش از حد مصرف‌شده مثل آسمان بی‌انتها، قلب شکسته، شب تاریک و اشک‌های پنهان فقط در صورت ضرورت استفاده کن.
تصاویر تازه، جزئیات ملموس و تشبیه‌های خلاقانه بساز.

5. ترجیع‌بند یا Chorus باید قوی، به‌یادماندنی و قابل زمزمه کردن باشد.
یک جمله یا عبارت شاخص داشته باشد که شنونده پس از یک بار شنیدن بتواند به خاطر بسپارد.

6. هر بخش باید وظیفه مشخصی داشته باشد:
[Verse 1] معرفی داستان و احساس
[Pre-Chorus] افزایش هیجان و آماده‌سازی ترجیع‌بند
[Chorus] پیام اصلی و بخش ماندگار ترانه
[Verse 2] ادامه داستان با تصویرها و اتفاقات تازه
[Bridge] یک تغییر احساسی یا نگاه متفاوت
[Final Chorus] بازگشت قدرتمند به ترجیع‌بند

7. از تکرار بی‌دلیل یک جمله یا پر کردن سطرها با کلمات بی‌معنی خودداری کن.

8. زبان ترانه باید طبیعی و متناسب با زبان انتخاب‌شده باشد.
اگر زبان فارسی است، فارسی روان و امروزی بنویس؛ نه نثر ادبی سنگین و نه ترجمه تحت‌اللفظی.

9. ترانه باید با سبک موسیقی انتخاب‌شده هماهنگ باشد.
مثلاً ترانه عاشقانه پاپ با ترانه حماسی، غمگین یا شاد تفاوت داشته باشد.

10. کیفیت را به طول ترجیح بده.
ترانه کامل و منسجم بنویس، اما سطرهای اضافی و بی‌هدف نساز.

قالب خروجی:
[Verse 1]
متن ترانه

[Pre-Chorus]
متن ترانه

[Chorus]
متن ترانه

[Verse 2]
متن ترانه

[Bridge]
متن ترانه

[Final Chorus]
متن ترانه

مهم‌ترین قوانین خروجی:
- مستقیماً با [Verse 1] شروع کن.
- هیچ مقدمه، توضیح، تحلیل یا عنوانی ننویس.
- درباره روند نوشتن توضیح نده.
- فقط متن نهایی ترانه را تحویل بده.
- هیچ بخشی از این دستورالعمل را در خروجی تکرار نکن.
`;

      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            })
          }
        );

        const data = await geminiRes.json();

        if (!geminiRes.ok) {
          return json(
            { error: data.error?.message || "خطا در ارتباط با جمنای" },
            500,
            corsOrigin
          );
        }

        const lyrics = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!lyrics) {
          return json({ error: "متنی از جمنای دریافت نشد." }, 502, corsOrigin);
        }

        return json({ success: true, lyrics }, 200, corsOrigin);

      } catch (e) {
        return json(
          { error: "خطای سرور در ساخت شعر", details: e.message },
          500,
          corsOrigin
        );
      }
    }

    // ۲. مسیر ساخت آهنگ
    if (url.pathname === "/generate-music" && request.method === "POST") {
      const apiKey = env.ACEMUSIC_API_KEY;

      if (!apiKey) {
        return json({ error: "کلید ACEMUSIC_API_KEY تنظیم نشده است." }, 500, corsOrigin);
      }

      let input;
      try {
        input = await request.json();
      } catch {
        return json({ error: "فرمت اطلاعات ارسالی نامعتبر است." }, 400, corsOrigin);
      }

      const lyrics = String(input.lyrics || input.topic || "Test song").trim();

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
        const res = await fetch("https://api.acemusic.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });

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

        if (!res.ok) {
          return json(
            { error: "خطا از سرور Ace Music", details: data, status: res.status },
            500,
            corsOrigin
          );
        }

        const audioUrl = data.choices?.[0]?.message?.audio?.[0]?.audio_url?.url;

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

        return json({ success: true, audioUrl }, 200, corsOrigin);

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

    return json({ error: "Not found" }, 404, corsOrigin);
  }
};
