import test from "node:test";
import assert from "node:assert/strict";
import {
  createNaviSession,
  hashNaviPassword,
  verifyNaviPassword,
  verifyNaviSession
} from "../modules/navi-auth.js";

test("PBKDF2 password hashes verify only the correct password", async () => {
  const hash = await hashNaviPassword("a-strong-test-password");
  assert.match(hash, /^pbkdf2\$310000\$/);
  assert.equal(await verifyNaviPassword("a-strong-test-password", hash), true);
  assert.equal(await verifyNaviPassword("wrong-password", hash), false);
});

test("password hashing rejects short passwords", async () => {
  await assert.rejects(() => hashNaviPassword("short"));
});

test("signed sessions retain the server-selected user identity and role", async () => {
  const secret = "test-session-secret-with-enough-entropy";
  const token = await createNaviSession(secret, {
    id: "user-123",
    username: "sample",
    display_name: "Sample User",
    role: "user"
  });
  const session = await verifyNaviSession(token, secret);
  assert.equal(session.sub, "user-123");
  assert.equal(session.name, "Sample User");
  assert.equal(session.role, "user");
});

test("session verification rejects a modified token", async () => {
  const token = await createNaviSession("test-session-secret");
  const changed = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
  assert.equal(await verifyNaviSession(changed, "test-session-secret"), null);
});


test("active user sessions resolve the current account role and display name from D1", async () => {
  const { authorizeNaviRequest } = await import("../modules/navi-auth.js");
  const secret = "test-session-secret-with-enough-entropy";
  const token = await createNaviSession(secret, {
    id: "user-123", display_name: "Old Name", role: "user"
  });
  const env = {
    NAVI_SESSION_SECRET: secret,
    NAVA_DB: {
      prepare(sql) {
        assert.match(sql, /FROM users WHERE id = \?/);
        return {
          bind(id) {
            assert.equal(id, "user-123");
            return { async first() { return { id, display_name: "Current Name", role: "user", status: "active" }; } };
          }
        };
      }
    }
  };
  const result = await authorizeNaviRequest(new Request("https://example.test", {
    headers: { Authorization: "Bearer " + token }
  }), env);
  assert.equal(result.valid, true);
  assert.equal(result.user.display_name, "Current Name");
});

test("disabled user sessions are rejected immediately", async () => {
  const { authorizeNaviRequest } = await import("../modules/navi-auth.js");
  const secret = "test-session-secret-with-enough-entropy";
  const token = await createNaviSession(secret, { id: "user-disabled", role: "user" });
  const env = {
    NAVI_SESSION_SECRET: secret,
    NAVA_DB: {
      prepare() {
        return { bind() { return { async first() { return { id: "user-disabled", role: "user", status: "disabled" }; } }; } };
      }
    }
  };
  const result = await authorizeNaviRequest(new Request("https://example.test", {
    headers: { Authorization: "Bearer " + token }
  }), env);
  assert.equal(result.valid, false);
  assert.equal(result.code, "NAVI_ACCOUNT_DISABLED");
});
