import test from "node:test";
import { readFileSync } from "node:fs";
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


test("owner sessions are checked against the active owner row in D1", async () => {
  const { authorizeNaviRequest } = await import("../modules/navi-auth.js");
  const secret = "test-session-secret-with-enough-entropy";
  const token = await createNaviSession(secret, {
    id: "owner", display_name: "Owner", role: "owner"
  });
  const env = {
    NAVI_SESSION_SECRET: secret,
    NAVA_DB: {
      prepare() {
        return {
          bind() {
            return { async first() {
              return { id: "owner", display_name: "مالک", role: "owner", status: "active" };
            } };
          }
        };
      }
    }
  };
  const result = await authorizeNaviRequest(new Request("https://example.test", {
    headers: { Authorization: "Bearer " + token }
  }), env);
  assert.equal(result.valid, true);
  assert.equal(result.user.role, "owner");
});

test("disabled owner sessions are rejected immediately", async () => {
  const { authorizeNaviRequest } = await import("../modules/navi-auth.js");
  const secret = "test-session-secret-with-enough-entropy";
  const token = await createNaviSession(secret, { id: "owner", role: "owner" });
  const env = {
    NAVI_SESSION_SECRET: secret,
    NAVA_DB: {
      prepare() {
        return { bind() { return { async first() {
          return { id: "owner", role: "owner", status: "disabled" };
        } }; } };
      }
    }
  };
  const result = await authorizeNaviRequest(new Request("https://example.test", {
    headers: { Authorization: "Bearer " + token }
  }), env);
  assert.equal(result.valid, false);
  assert.equal(result.code, "NAVI_ACCOUNT_DISABLED");
});

test("owner login provisions PBKDF2 once and then authenticates from D1 hash", async () => {
  const { handleNaviRoute } = await import("../modules/navi.js");
  const oldSecret = "legacy-owner-password-123";
  const ownerRow = {
    id: "owner", username: "owner", display_name: "مالک",
    role: "owner", status: "active", password_hash: null
  };
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              assert.match(sql, /SELECT .*FROM users WHERE id = \?/s);
              return { ...ownerRow };
            },
            async run() {
              assert.match(sql, /UPDATE users SET .*password_hash/s);
              ownerRow.password_hash = values[0];
              return { success: true, meta: { changes: 1 } };
            }
          };
        }
      };
    }
  };
  const env = {
    NAVI_SESSION_SECRET: "test-session-secret-with-enough-entropy",
    NAVI_OWNER_PASSWORD: oldSecret,
    NAVA_DB: db
  };

  async function login(password) {
    const request = new Request("https://worker.example/navi-login", {
      method: "POST",
      headers: {
        Origin: "https://honrrpower-a11y.github.io",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username: "owner", password })
    });
    return handleNaviRoute({
      request,
      env,
      url: new URL(request.url),
      origin: "https://honrrpower-a11y.github.io",
      corsOrigin: "https://honrrpower-a11y.github.io"
    });
  }

  const first = await login(oldSecret);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).success, true);
  assert.match(ownerRow.password_hash, /^pbkdf2\$310000\$/);

  env.NAVI_OWNER_PASSWORD = "a-different-legacy-password";
  const second = await login(oldSecret);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).success, true);

  const wrong = await login("a-different-legacy-password");
  assert.equal(wrong.status, 401);
});


test("owner sessions are rejected if the D1 row no longer grants owner role", async () => {
  const { authorizeNaviRequest } = await import("../modules/navi-auth.js");
  const secret = "test-session-secret-with-enough-entropy";
  const token = await createNaviSession(secret, { id: "owner", role: "owner" });
  const env = {
    NAVI_SESSION_SECRET: secret,
    NAVA_DB: {
      prepare() {
        return { bind() { return { async first() {
          return { id: "owner", role: "user", status: "active" };
        } }; } };
      }
    }
  };
  const result = await authorizeNaviRequest(new Request("https://example.test", {
    headers: { Authorization: "Bearer " + token }
  }), env);
  assert.equal(result.valid, false);
  assert.equal(result.code, "NAVI_OWNER_REQUIRED");
});

test("production deploy workflow guards the approved Worker and D1 target", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/navi-production-deploy.yml", import.meta.url),
    "utf8"
  );
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /modules\/navi-auth\.js/);
  assert.match(workflow, /prod\.database_name !== 'nava-memory'/);
  assert.match(workflow, /prod\.database_id !== '56f30fed-a03b-4e36-a320-cbefd3feaf12'/);
  assert.match(workflow, /No database migrations will run/);
});
