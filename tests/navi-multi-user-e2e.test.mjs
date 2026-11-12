import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import { handleNaviRoute } from "../modules/navi.js";
import { ALLOWED_ORIGIN } from "../modules/config.js";


const testCrypto = webcrypto;
function toBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}
async function makeVerifier(password) {
  const salt = testCrypto.getRandomValues(new Uint8Array(16));
  const material = await testCrypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await testCrypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000 }, material, 256);
  return "pbkdf2$310000$" + toBase64Url(salt) + "$" + toBase64Url(new Uint8Array(bits));
}
async function loginWithPassword(env, username, password) {
  const challengeResponse = await callNavi(env, "/navi-auth-challenge", "POST", { body: { username } });
  const challengeData = await challengeResponse.json();
  assert.equal(challengeResponse.status, 200, JSON.stringify(challengeData));
  let body;
  if (challengeData.mode === "legacy") {
    body = { username, password, passwordHash: await makeVerifier(password) };
  } else {
    const salt = Buffer.from(challengeData.salt, "base64url");
    const material = await testCrypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await testCrypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: challengeData.iterations }, material, 256);
    const hmacKey = await testCrypto.subtle.importKey("raw", bits, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const message = "navi-login|" + challengeData.challengeId + "|" + username + "|" + challengeData.nonce;
    const proof = toBase64Url(new Uint8Array(await testCrypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(message))));
    body = { username, challengeId: challengeData.challengeId, proof };
  }
  return callNavi(env, "/navi-login", "POST", { body });
}

function createD1Adapter(sqlite, options = {}) {
  return {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) {
          values = args;
          return statement;
        },
        async first() {
          return sqlite.prepare(sql).get(...values) || null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...values) };
        },
        async run() {
          if (options.failOwnerHashProvision && /^UPDATE users SET username = COALESCE/.test(sql)) {
            throw new Error("Simulated D1 write failure for owner hash provisioning.");
          }
          const result = sqlite.prepare(sql).run(...values);
          return {
            success: true,
            meta: {
              changes: Number(result.changes),
              last_row_id: Number(result.lastInsertRowid || 0)
            }
          };
        }
      };
      return statement;
    }
  };
}

async function callNavi(env, path, method = "GET", options = {}) {
  const url = new URL("https://worker.example" + path);
  const headers = { Origin: ALLOWED_ORIGIN };
  if (options.token) headers.Authorization = "Bearer " + options.token;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const request = new Request(url, {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });
  return handleNaviRoute({
    request,
    env,
    url,
    origin: ALLOWED_ORIGIN,
    corsOrigin: ALLOWED_ORIGIN
  });
}

test("isolated SQLite end-to-end: owner login, invited account, memory isolation and immediate session revocation", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        auth_provider TEXT,
        auth_subject TEXT UNIQUE,
        display_name TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    sqlite.exec(readFileSync(new URL("../migrations/0002_navi_multi_user_accounts.sql", import.meta.url), "utf8"));
    sqlite.exec(readFileSync(new URL("../migrations/0003_navi_auth_challenges.sql", import.meta.url), "utf8"));
    sqlite.exec(readFileSync(new URL("../migrations/0001_navi_memory_schema.sql", import.meta.url), "utf8"));

    const env = {
      NAVI_SESSION_SECRET: "isolated-test-session-secret-with-strong-entropy",
      NAVI_OWNER_PASSWORD: "isolated-legacy-owner-password",
      NAVA_DB: createD1Adapter(sqlite)
    };

    // First owner login enrolls a browser-derived PBKDF2 verifier.
    const ownerLogin = await loginWithPassword(env, "owner", env.NAVI_OWNER_PASSWORD);
    assert.equal(ownerLogin.status, 200);
    const ownerLoginData = await ownerLogin.json();
    assert.equal(ownerLoginData.success, true);
    assert.equal(ownerLoginData.user.id, "owner");
    assert.equal(ownerLoginData.user.role, "owner");
    const ownerToken = ownerLoginData.token;
    const ownerHash = sqlite.prepare("SELECT password_hash FROM users WHERE id = 'owner'").get().password_hash;
    assert.match(ownerHash, /^pbkdf2\$310000\$/);

    // After provisioning, the D1 hash is authoritative; the legacy fallback cannot bypass it.
    env.NAVI_OWNER_PASSWORD = "a-different-legacy-password";
    const ownerLoginAgain = await loginWithPassword(env, "owner", "isolated-legacy-owner-password");
    assert.equal(ownerLoginAgain.status, 200);
    const wrongOwnerLogin = await loginWithPassword(env, "owner", env.NAVI_OWNER_PASSWORD);
    assert.equal(wrongOwnerLogin.status, 401);

    // Owner creates an invite-only account; the new user can then log in.
    const createUser = await callNavi(env, "/navi-users", "POST", {
      token: ownerToken,
      body: {
        action: "create",
        username: "second.user",
        displayName: "Second Test User",
        passwordHash: await makeVerifier("second-user-password-123")
      }
    });
    assert.equal(createUser.status, 201);
    const createdData = await createUser.json();
    assert.equal(createdData.success, true);
    assert.equal(createdData.user.username, "second.user");
    assert.equal(createdData.user.role, "user");
    assert.equal(createdData.user.status, "active");
    const secondUserId = createdData.user.id;

    const secondLogin = await loginWithPassword(env, "second.user", "second-user-password-123");
    assert.equal(secondLogin.status, 200);
    const secondLoginData = await secondLogin.json();
    assert.equal(secondLoginData.success, true);
    assert.equal(secondLoginData.user.id, secondUserId);
    assert.equal(secondLoginData.user.role, "user");
    const secondToken = secondLoginData.token;

    // A valid challenge proof is accepted once and cannot be replayed.
    const replayChallengeResponse = await callNavi(env, "/navi-auth-challenge", "POST", {
      body: { username: "second.user" }
    });
    const replayChallenge = await replayChallengeResponse.json();
    const replaySalt = Buffer.from(replayChallenge.salt, "base64url");
    const replayMaterial = await testCrypto.subtle.importKey("raw", new TextEncoder().encode("second-user-password-123"), "PBKDF2", false, ["deriveBits"]);
    const replayBits = await testCrypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: replaySalt, iterations: replayChallenge.iterations }, replayMaterial, 256);
    const replayKey = await testCrypto.subtle.importKey("raw", replayBits, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const replayMessage = "navi-login|" + replayChallenge.challengeId + "|second.user|" + replayChallenge.nonce;
    const replayProof = toBase64Url(new Uint8Array(await testCrypto.subtle.sign("HMAC", replayKey, new TextEncoder().encode(replayMessage))));
    const replayBody = { username: "second.user", challengeId: replayChallenge.challengeId, proof: replayProof };
    const firstProofUse = await callNavi(env, "/navi-login", "POST", { body: replayBody });
    const repeatedProofUse = await callNavi(env, "/navi-login", "POST", { body: replayBody });
    assert.equal(firstProofUse.status, 200);
    assert.equal(repeatedProofUse.status, 401);

    // Each account gets a separate main thread; the owner's legacy thread ID is preserved.
    const ownerThreadsResponse = await callNavi(env, "/navi-threads", "GET", { token: ownerToken });
    const secondThreadsResponse = await callNavi(env, "/navi-threads", "GET", { token: secondToken });
    const ownerThreads = await ownerThreadsResponse.json();
    const secondThreads = await secondThreadsResponse.json();
    assert.equal(ownerThreadsResponse.status, 200);
    assert.equal(secondThreadsResponse.status, 200);
    assert.equal(ownerThreads.threads[0].thread_id, "owner-main");
    assert.equal(secondThreads.threads[0].thread_id, secondUserId + "-main");

    // Seed private records in the isolated test database and verify route-level ownership filters.
    sqlite.prepare(`
      INSERT INTO navi_chat_messages_v1 (thread_id, role, content)
      VALUES (?, 'user', ?)
    `).run("owner-main", "owner-private-e2e-marker");
    sqlite.prepare(`
      INSERT INTO navi_chat_messages_v1 (thread_id, role, content)
      VALUES (?, 'user', ?)
    `).run(secondUserId + "-main", "second-user-private-e2e-marker");
    sqlite.prepare(`
      INSERT INTO navi_memory_facts_v1 (owner_id, memory_key, memory_value, source, status)
      VALUES (?, ?, ?, 'e2e-test', 'approved')
    `).run("owner", "owner-test-memory", "owner-only-memory-marker");
    sqlite.prepare(`
      INSERT INTO navi_memory_facts_v1 (owner_id, memory_key, memory_value, source, status)
      VALUES (?, ?, ?, 'e2e-test', 'approved')
    `).run(secondUserId, "second-user-test-memory", "second-user-only-memory-marker");

    const ownerHistoryResponse = await callNavi(env, "/navi-history", "GET", { token: ownerToken });
    const secondHistoryResponse = await callNavi(env, "/navi-history", "GET", { token: secondToken });
    const ownerHistory = await ownerHistoryResponse.json();
    const secondHistory = await secondHistoryResponse.json();
    assert.equal(ownerHistoryResponse.status, 200);
    assert.equal(secondHistoryResponse.status, 200);
    assert.match(JSON.stringify(ownerHistory.messages), /owner-private-e2e-marker/);
    assert.doesNotMatch(JSON.stringify(ownerHistory.messages), /second-user-private-e2e-marker/);
    assert.match(JSON.stringify(secondHistory.messages), /second-user-private-e2e-marker/);
    assert.doesNotMatch(JSON.stringify(secondHistory.messages), /owner-private-e2e-marker/);

    const crossHistory = await callNavi(
      env,
      "/navi-history?thread_id=owner-main",
      "GET",
      { token: secondToken }
    );
    assert.equal(crossHistory.status, 404);

    const ownerMemoryResponse = await callNavi(env, "/navi-memory", "GET", { token: ownerToken });
    const secondMemoryResponse = await callNavi(env, "/navi-memory", "GET", { token: secondToken });
    const ownerMemory = await ownerMemoryResponse.json();
    const secondMemory = await secondMemoryResponse.json();
    assert.equal(ownerMemoryResponse.status, 200);
    assert.equal(secondMemoryResponse.status, 200);
    assert.match(JSON.stringify(ownerMemory.memories), /owner-only-memory-marker/);
    assert.doesNotMatch(JSON.stringify(ownerMemory.memories), /second-user-only-memory-marker/);
    assert.match(JSON.stringify(secondMemory.memories), /second-user-only-memory-marker/);
    assert.doesNotMatch(JSON.stringify(secondMemory.memories), /owner-only-memory-marker/);

    // Disabling the invited account must invalidate its already-issued session on the next request.
    const disableUser = await callNavi(env, "/navi-users", "POST", {
      token: ownerToken,
      body: { action: "set_status", userId: secondUserId, status: "disabled" }
    });
    assert.equal(disableUser.status, 200);
    const disabledSessionRequest = await callNavi(env, "/navi-threads", "GET", { token: secondToken });
    assert.equal(disabledSessionRequest.status, 401);
    const disabledData = await disabledSessionRequest.json();
    assert.equal(disabledData.code, "NAVI_ACCOUNT_DISABLED");

    // The owner's session remains valid, and account listings never expose password hashes.
    const ownerStillActive = await callNavi(env, "/navi-threads", "GET", { token: ownerToken });
    assert.equal(ownerStillActive.status, 200);
    const accountListResponse = await callNavi(env, "/navi-users", "GET", { token: ownerToken });
    const accountList = await accountListResponse.json();
    assert.equal(accountListResponse.status, 200);
    assert.equal(JSON.stringify(accountList).includes("password_hash"), false);
  } finally {
    sqlite.close();
  }
});

test("owner login fails closed if the initial verifier cannot be persisted", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        auth_provider TEXT,
        auth_subject TEXT UNIQUE,
        display_name TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    sqlite.exec(readFileSync(new URL("../migrations/0002_navi_multi_user_accounts.sql", import.meta.url), "utf8"));
    sqlite.exec(readFileSync(new URL("../migrations/0001_navi_memory_schema.sql", import.meta.url), "utf8"));

    const env = {
      NAVI_SESSION_SECRET: "isolated-test-session-secret-with-strong-entropy",
      NAVI_OWNER_PASSWORD: "isolated-legacy-owner-password",
      NAVA_DB: createD1Adapter(sqlite, { failOwnerHashProvision: true })
    };

    const response = await callNavi(env, "/navi-login", "POST", {
      body: { username: "owner", password: env.NAVI_OWNER_PASSWORD, passwordHash: await makeVerifier(env.NAVI_OWNER_PASSWORD) }
    });
    const data = await response.json();

    assert.equal(response.status, 500);
    assert.equal(data.success, false);
    assert.equal(data.token, undefined);
    const ownerHash = sqlite.prepare("SELECT password_hash FROM users WHERE id = 'owner'").get().password_hash;
    assert.equal(ownerHash, null);
  } finally {
    sqlite.close();
  }
});
