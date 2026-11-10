// احراز هویت و نشست امن NAVI
export function base64UrlEncode(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function base64UrlDecode(value) {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const binary = atob(
    normalized + "=".repeat((4 - normalized.length % 4) % 4)
  );

  return Uint8Array.from(
    binary,
    c => c.charCodeAt(0)
  );
}

export async function getNaviSigningKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign", "verify"]
  );
}

export async function createNaviSession(secret) {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: "nava-navi",
    sub: "owner",
    iat: now,
    exp: now + 12 * 60 * 60
  };

  const payloadPart = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload))
  );

  const key = await getNaviSigningKey(secret);

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadPart)
  );

  return payloadPart + "." + base64UrlEncode(
    new Uint8Array(signature)
  );
}

export async function verifyNaviSession(token, secret) {
  try {
    if (
      typeof token !== "string" ||
      token.length > 2000
    ) {
      return false;
    }

    const parts = token.split(".");

    if (parts.length !== 2) return false;

    const [payloadPart, signaturePart] = parts;
    const key = await getNaviSigningKey(secret);

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signaturePart),
      new TextEncoder().encode(payloadPart)
    );

    if (!valid) return false;

    const payload = JSON.parse(
      new TextDecoder().decode(
        base64UrlDecode(payloadPart)
      )
    );

    const now = Math.floor(Date.now() / 1000);

    return (
      payload.iss === "nava-navi" &&
      payload.sub === "owner" &&
      Number.isFinite(payload.exp) &&
      payload.exp > now &&
      Number.isFinite(payload.iat) &&
      payload.iat <= now + 60
    );

  } catch {
    return false;
  }
}

export async function verifyNaviPassword(inputPassword, realPassword) {
  if (
    typeof inputPassword !== "string" ||
    typeof realPassword !== "string" ||
    inputPassword.length < 1 ||
    inputPassword.length > 256
  ) {
    return false;
  }

  const encoder = new TextEncoder();

  const inputHash = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(inputPassword)
    )
  );

  const realHash = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(realPassword)
    )
  );

  let difference = 0;

  for (let i = 0; i < inputHash.length; i++) {
    difference |= inputHash[i] ^ realHash[i];
  }

  return difference === 0;
}

// ==========================================
// بررسی نشست NAVI برای مسیرهای محافظت‌شده
// ==========================================

export async function authorizeNaviRequest(request, env) {
  if (!env.NAVI_SESSION_SECRET) {
    return {
      valid: false,
      status: 500,
      error: "تنظیمات امنیتی ناوی کامل نیست."
    };
  }

  const authorization =
    request.headers.get("Authorization") || "";

  const sessionToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  const sessionValid = await verifyNaviSession(
    sessionToken,
    env.NAVI_SESSION_SECRET
  );

  if (!sessionValid) {
    return {
      valid: false,
      status: 401,
      error: "نشست ورود معتبر نیست یا منقضی شده است.",
      code: "NAVI_AUTH_REQUIRED"
    };
  }

  return {
    valid: true
  };
}
