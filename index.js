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
      try { input = await request.json(); } catch {
        return json({ error: "اطلاعات ارسالی نامعتبر است." }, 400, corsOrigin);
      }

      const topic = String(input.topic || "").trim();
      const style = String(input.style || "پاپ").trim();
      const language = String(input.language || "fa").trim();

      if (!topic) {
        return json({ error: "موضوع شعر نمی‌تواند خالی باشد." }, 400, corsOrigin);
      }

      const prompt = `یک شعر با موضوع "${topic}" و سبک "${style}" به زبان "${language}" بنویس. ساختار استاندارد ترانه شامل بندهای Verse و Chorus داشته باشد.`;

      try {
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const data = await geminiRes.json();
        if (!geminiRes.ok) {
          return json({ error: data.error?.message || "خطا در ارتباط با جمنای" }, 500, corsOrigin);
        }

        const lyrics = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!lyrics) {
          return json({ error: "متنی از جمنای دریافت نشد." }, 502, corsOrigin);
        }

        return json({ success: true, lyrics }, 200, corsOrigin);
      } catch (e) {
        return json({ error: "خطای سرور در ساخت شعر", details: e.message }, 500, corsOrigin);
      }
    }

    // ۲. مسیر ساخت آهنگ
    if (url.pathname === "/generate-music" && request.method === "POST") {
      const apiKey = env.ACEMUSIC_API_KEY;
      if (!apiKey) {
        return json({ error: "کلید ACEMUSIC_API_KEY تنظیم نشده است." }, 500, corsOrigin);
      }

      let input;
      try { input = await request.json(); } catch {
        return json({ error: "فرمت اطلاعات ارسالی نامعتبر است." }, 400, corsOrigin);
      }

      const lyrics = String(input.lyrics || input.topic || "Test song").trim();

      const body = {
        model: "acemusic/acestep-v1.5-turbo",
        messages: [{ role: "user", content: `<lyrics>\n${lyrics}\n</lyrics>` }],
        stream: false,
        audio_config: { format: "mp3", duration: 30, vocal_language: "fa", instrumental: false }
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
          return json({ error: "پاسخ سرور Ace Music غیرقابل پردازش است.", rawResponse: rawText, status: res.status }, 500, corsOrigin);
        }

        if (!res.ok) {
          return json({ error: "خطا از سرور Ace Music", details: data, status: res.status }, 500, corsOrigin);
        }

        const audioUrl = data.choices?.[0]?.message?.audio?.[0]?.audio_url?.url;
        if (!audioUrl) {
          return json({ error: "پاسخ دریافت شد اما لینک فایل صوتی در آن نبود.", raw: data }, 502, corsOrigin);
        }

        return json({ success: true, audioUrl }, 200, corsOrigin);
      } catch (e) {
        return json({ error: "خطای پردازش در ارتباط با سرور موزیک", details: e.message }, 500, corsOrigin);
      }
    }

    return json({ error: "Not found" }, 404, corsOrigin);
  }
};
