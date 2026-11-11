// NAVI authentication: signed sessions and PBKDF2 password hashes.

export function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

export async function getNaviSigningKey(secret) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

export async function createNaviSession(secret, user = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "nava-navi",
    sub: String(user.id || "owner"),
    name: String(user.display_name || user.username || "مالک"),
    role: String(user.role || "owner"),
    iat: now,
    exp: now + 12 * 60 * 60
  };
  const payloadPart = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getNaviSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadPart));
  return payloadPart + "." + base64UrlEncode(new Uint8Array(signature));
}

// Returns the verified session claims, or null. Never trusts unsigned client fields.
export async function verifyNaviSession(token, secret) {
  try {
    if (typeof token !== "string" || token.length > 2000) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadPart, signaturePart] = parts;
    if (!/^[A-Za-z0-9_-]+$/.test(payloadPart) || !/^[A-Za-z0-9_-]+$/.test(signaturePart)) return null;
    if (base64UrlEncode(base64UrlDecode(payloadPart)) !== payloadPart ||
        base64UrlEncode(base64UrlDecode(signaturePart)) !== signaturePart) return null;
    const key = await getNaviSigningKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC", key, base64UrlDecode(signaturePart), new TextEncoder().encode(payloadPart)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart)));
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.iss !== "nava-navi" ||
      typeof payload.sub !== "string" || !payload.sub ||
      !Number.isFinite(payload.exp) || payload.exp <= now ||
      !Number.isFinite(payload.iat) || payload.iat > now + 60 ||
      !["owner", "user"].includes(payload.role)
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

const PBKDF2_ITERATIONS = 310000;

export async function hashNaviPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 256) {
    throw new Error("Password must contain 12 to 256 characters.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key, 256
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(new Uint8Array(bits))}`;
}

export async function verifyNaviPassword(inputPassword, storedHash) {
  if (
    typeof inputPassword !== "string" || inputPassword.length < 1 || inputPassword.length > 256 ||
    typeof storedHash !== "string"
  ) return false;

  // Legacy compatibility is intentionally limited to the old owner secret.
  if (!storedHash.startsWith("pbkdf2$")) {
    const encoder = new TextEncoder();
    const inputHash = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(inputPassword)));
    const realHash = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(storedHash)));
    let difference = 0;
    for (let i = 0; i < inputHash.length; i++) difference |= inputHash[i] ^ realHash[i];
    return difference === 0;
  }

  try {
    const [scheme, iterationsText, saltText, hashText] = storedHash.split("$");
    const iterations = Number(iterationsText);
    if (scheme !== "pbkdf2" || !Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
    const salt = base64UrlDecode(saltText);
    const expected = base64UrlDecode(hashText);
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(inputPassword), "PBKDF2", false, ["deriveBits"]
    );
    const actual = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, expected.length * 8
    ));
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
    return difference === 0;
  } catch {
    return false;
  }
}

export async function authorizeNaviRequest(request, env) {
  if (!env.NAVI_SESSION_SECRET) {
    return { valid: false, status: 500, error: "تنظیمات امنیتی ناوی کامل نیست." };
  }
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const session = await verifyNaviSession(token, env.NAVI_SESSION_SECRET);
  if (!session) {
    return {
      valid: false, status: 401,
      error: "نشست ورود معتبر نیست یا منقضی شده است.",
      code: "NAVI_AUTH_REQUIRED"
    };
  }
  let user = { id: session.sub, display_name: session.name, role: session.role };
  // Non-owner sessions are checked against the account table on every request,
  // so an owner can disable an account without waiting for its token to expire.
  if (session.sub !== "owner") {
    if (!env.NAVA_DB) {
      return { valid: false, status: 503, error: "دیتابیس حساب‌های ناوی در دسترس نیست." };
    }
    try {
      const row = await env.NAVA_DB.prepare(
        "SELECT id, display_name, role, status FROM users WHERE id = ? LIMIT 1"
      ).bind(session.sub).first();
      if (!row || row.status !== "active") {
        return { valid: false, status: 401, error: "این حساب غیرفعال است یا دیگر وجود ندارد.", code: "NAVI_ACCOUNT_DISABLED" };
      }
      user = {
        id: String(row.id),
        display_name: row.display_name || session.name,
        role: row.role === "owner" ? "owner" : "user"
      };
    } catch {
      return { valid: false, status: 503, error: "بررسی وضعیت حساب ناوی ممکن نشد." };
    }
  }
  return { valid: true, user };
}
