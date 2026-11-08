// حافظه و تاریخچه پایدار NAVI در D1
import { safeNaviText } from "./shared.js";

export function prepareNaviHistory(history, currentMessage) {
  const rawHistory = Array.isArray(history)
    ? history.slice(-10)
    : [];

  const contents = [];

  for (const item of rawHistory) {
    if (!item || typeof item !== "object") continue;

    let role = String(item.role || "").toLowerCase();

    if (role === "assistant") role = "model";

    if (role !== "user" && role !== "model") continue;

    const historyText = safeNaviText(
      item.content || item.text || "",
      2000
    );

    if (!historyText) continue;

    const previousMessage = contents[contents.length - 1];

    if (previousMessage && previousMessage.role === role) {
      previousMessage.parts[0].text += "\n" + historyText;
    } else {
      contents.push({
        role,
        parts: [{ text: historyText }]
      });
    }
  }

  while (
    contents.length > 0 &&
    contents[0].role !== "user"
  ) {
    contents.shift();
  }

  const lastMessage = contents[contents.length - 1];

  if (
    lastMessage &&
    lastMessage.role === "user" &&
    lastMessage.parts[0].text.trim() === currentMessage.trim()
  ) {
    return contents;
  }

  if (lastMessage && lastMessage.role === "user") {
    lastMessage.parts[0].text += "\n" + currentMessage;
  } else {
    contents.push({
      role: "user",
      parts: [{ text: currentMessage }]
    });
  }

  return contents;
}

// ==========================================
// تنظیمات حافظه پایدار NAVI - D1
// ==========================================

export const NAVI_MAIN_THREAD_ID = "owner-main";
export const NAVI_OWNER_ID = "owner";

export async function ensureNaviMainThread(db) {
  await db.prepare(`
    INSERT OR IGNORE INTO navi_chat_threads_v1
    (thread_id, owner_id, title)
    VALUES (?, ?, ?)
  `).bind(
    NAVI_MAIN_THREAD_ID,
    NAVI_OWNER_ID,
    "گفت‌وگوی اصلی ناوی"
  ).run();
}

export async function getNaviDbHistory(db, limit = 10) {
  const result = await db.prepare(`
    SELECT role, content, created_at
    FROM navi_chat_messages_v1
    WHERE thread_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).bind(
    NAVI_MAIN_THREAD_ID,
    limit
  ).all();

  return (result.results || []).reverse().map(row => ({
    role: row.role,
    content: row.content,
    created_at: row.created_at
  }));
}

export async function getNaviApprovedMemory(db) {
  const result = await db.prepare(`
    SELECT memory_key, memory_value
    FROM navi_memory_facts_v1
    WHERE owner_id = ?
      AND status = 'approved'
    ORDER BY updated_at DESC
    LIMIT 100
  `).bind(NAVI_OWNER_ID).all();

  return result.results || [];
}

// ==========================================
// تشخیص دستور و اطلاعات قابل ذخیره در حافظه
// ==========================================

export function parseNaviMemoryCommand(message) {
  const text = safeNaviText(message, 4000);

  // حالت اول: دستور «به خاطر بسپار»
  const rememberMatch = text.match(
    /^\s*(?:ناوی[،,:؛]?\s*)?(?:لطفاً\s*)?به\s+خاطر\s+بسپار(?:\s+که)?\s*[:：،-]?\s*/u
  );

  if (rememberMatch) {
    const value = safeNaviText(
      text.slice(rememberMatch[0].length),
      1000
    );

    return {
      isCommand: true,
      value,
      memoryKey: "یادداشت کاربر",
      memoryValue: value,
      source: "user_command",
      type: "explicit"
    };
  }

  // حالت دوم: دستور ثبت در حافظه بلندمدت
  const saveMatch = text.match(
    /^\s*(?:ناوی[،,:؛]?\s*)?(?:لطفاً\s*)?(?:این\s+)?(?:اطلاعات|مطلب|نکته|موضوع|مورد|رو|را)\s*(?:را|رو)?\s*(?:در|به)\s+حافظه\s+(?:بلندمدت|دائمی)(?:\s+خود)?\s*(?:ثبت|ذخیره|اضافه)\s*(?:کن|بکن|نمای)\s*[:：،-]?\s*/u
  );

  if (saveMatch) {
    const value = safeNaviText(
      text.slice(saveMatch[0].length),
      1000
    );

    return {
      isCommand: true,
      value,
      memoryKey: "یادداشت کاربر",
      memoryValue: value,
      source: "user_command",
      type: "explicit"
    };
  }

  // حالت سوم: عبارت‌های کوتاه‌تر برای ثبت در حافظه
  const shortSaveMatch = text.match(
    /^\s*(?:ناوی[،,:؛]?\s*)?(?:لطفاً\s*)?(?:ثبت|ذخیره)\s+کن(?:\s+که)?\s*[:：،-]?\s*/u
  );

  if (shortSaveMatch) {
    const value = safeNaviText(
      text.slice(shortSaveMatch[0].length),
      1000
    );

    return {
      isCommand: true,
      value,
      memoryKey: "یادداشت کاربر",
      memoryValue: value,
      source: "user_command",
      type: "explicit"
    };
  }

  // حالت چهارم: تشخیص معرفی صریح نام کاربر
  const nameMatch = text.match(
    /^\s*(?:اسم|نام)\s+من\s+(?:هم\s+)?([آ-یءاأإؤئ‌\-]{2,40})\s*(?:است|هست|می‌باشد|میباشد)?[.!؟،؛\s]*$/u
  );

  if (nameMatch) {
    const userName = safeNaviText(
      nameMatch[1].replace(/\s+/g, " "),
      60
    );

    if (userName) {
      return {
        isCommand: true,
        value: userName,
        memoryKey: "نام کاربر",
        memoryValue: userName,
        source: "user_statement",
        type: "profile"
      };
    }
  }

  return {
    isCommand: false,
    value: "",
    memoryKey: "",
    memoryValue: "",
    source: "",
    type: ""
  };
}

// ==========================================
// ذخیره یا به‌روزرسانی حافظه در D1
// ==========================================

export async function saveNaviMemoryFact(
  db,
  value,
  memoryKey = "یادداشت کاربر",
  source = "user_command"
) {
  const ownerId = NAVI_OWNER_ID;
  const cleanValue = String(value || "").trim();

  if (!cleanValue) {
    throw new Error("Memory value cannot be empty.");
  }

  // تشخیص هویت دستیار؛ نباید با اطلاعات کاربر اشتباه شود.
  const isAssistantIdentity =
    /(?:نام|اسم)\s*(?:دستیار|هوشمند)/u.test(cleanValue) &&
    /ناوی/u.test(cleanValue);

  const finalKey = isAssistantIdentity
    ? "هویت دستیار"
    : String(memoryKey || "یادداشت کاربر").trim();

  // فقط این دو کلید اجازه به‌روزرسانی دارند.
  const isProtectedProfileKey = [
    "نام کاربر",
    "هویت دستیار"
  ].includes(finalKey);

  // اطلاعات هویتی: بررسی رکورد قبلی با همان کلید.
  if (isProtectedProfileKey) {
    const existing = await db
      .prepare(`
        SELECT id, memory_value
        FROM navi_memory_facts_v1
        WHERE owner_id = ?
          AND memory_key = ?
          AND status = 'approved'
        ORDER BY id DESC
        LIMIT 1
      `)
      .bind(ownerId, finalKey)
      .first();

    if (existing) {
      if (existing.memory_value === cleanValue) {
        return {
          duplicate: true,
          updated: false,
          inserted: false,
          memoryKey: finalKey
        };
      }

      await db
        .prepare(`
          UPDATE navi_memory_facts_v1
          SET memory_value = ?,
              source = ?,
              status = 'approved'
          WHERE id = ?
            AND owner_id = ?
        `)
        .bind(
          cleanValue,
          source,
          existing.id,
          ownerId
        )
        .run();

      return {
        duplicate: false,
        updated: true,
        inserted: false,
        memoryKey: finalKey
      };
    }
  } else {
    // یادداشت عمومی: فقط تکرار دقیق را تشخیص بده.
    const existing = await db
      .prepare(`
        SELECT id
        FROM navi_memory_facts_v1
        WHERE owner_id = ?
          AND memory_value = ?
          AND status = 'approved'
        LIMIT 1
      `)
      .bind(ownerId, cleanValue)
      .first();

    if (existing) {
      return {
        duplicate: true,
        updated: false,
        inserted: false,
        memoryKey: finalKey
      };
    }
  }

  // هر یادداشت عمومی کلید مستقل می‌گیرد.
  const uniqueKey = isProtectedProfileKey
    ? finalKey
    : `${finalKey} ${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  await db
    .prepare(`
      INSERT INTO navi_memory_facts_v1
        (owner_id, memory_key, memory_value, source, status)
      VALUES (?, ?, ?, ?, 'approved')
    `)
    .bind(
      ownerId,
      uniqueKey,
      cleanValue,
      source
    )
    .run();

  return {
    duplicate: false,
    updated: false,
    inserted: true,
    memoryKey: uniqueKey
  };
}
export async function saveNaviConversation(db, userMessage, assistantMessage) {
  await db.batch([
    db.prepare(`
      INSERT INTO navi_chat_messages_v1
      (thread_id, role, content)
      VALUES (?, 'user', ?)
    `).bind(
      NAVI_MAIN_THREAD_ID,
      userMessage
    ),

    db.prepare(`
      INSERT INTO navi_chat_messages_v1
      (thread_id, role, content)
      VALUES (?, 'assistant', ?)
    `).bind(
      NAVI_MAIN_THREAD_ID,
      assistantMessage
    ),

    db.prepare(`
      UPDATE navi_chat_threads_v1
      SET updated_at = datetime('now')
      WHERE thread_id = ?
    `).bind(NAVI_MAIN_THREAD_ID)
  ]);
}
