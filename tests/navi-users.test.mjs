import test from "node:test";
import assert from "node:assert/strict";
import { createNaviSession } from "../modules/navi-auth.js";
import { handleNaviRoute } from "../modules/navi.js";
import { ALLOWED_ORIGIN } from "../modules/config.js";

function createEnv(account, onList = () => [], onStatus = () => ({ success: true, meta: { changes: 1 } })) {
  const secret = "test-session-secret-with-enough-entropy";
  const env = {
    NAVI_SESSION_SECRET: secret,
    NAVA_DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              async first() {
                assert.match(sql, /SELECT id, display_name, role, status FROM users WHERE id = \?/);
                assert.equal(values[0], account.id);
                return account;
              },
              async all() {
                assert.match(sql, /SELECT id, username, display_name, role, status, created_at, updated_at FROM users/);
                assert.doesNotMatch(sql, /password_hash/);
                return { results: onList() };
              },
              async run() {
                assert.match(sql, /UPDATE users SET status = \?, updated_at = datetime\('now'\) WHERE id = \? AND role = 'user'/);
                return onStatus(sql, values);
              }
            };
          }
        };
      }
    }
  };
  return { env, secret };
}

async function callRoute(env, secret, account, method, body = null) {
  const token = await createNaviSession(secret, {
    id: account.id,
    display_name: account.display_name,
    role: account.role
  });
  const request = new Request("https://worker.example/navi-users", {
    method,
    headers: {
      Origin: ALLOWED_ORIGIN,
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return handleNaviRoute({
    request,
    env,
    url: new URL(request.url),
    origin: ALLOWED_ORIGIN,
    corsOrigin: ALLOWED_ORIGIN
  });
}

test("only the owner can list accounts and password hashes are never selected", async () => {
  const owner = { id: "owner", display_name: "مالک", role: "owner", status: "active" };
  const { env, secret } = createEnv(owner, () => [
    { id: "owner", username: "owner", display_name: "مالک", role: "owner", status: "active" },
    { id: "user-1", username: "sample", display_name: "Sample", role: "user", status: "active" }
  ]);
  const response = await callRoute(env, secret, owner, "GET");
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.users.length, 2);
  assert.equal(JSON.stringify(data).includes("password_hash"), false);
});

test("owner can disable a normal account through a role-guarded update", async () => {
  const owner = { id: "owner", display_name: "مالک", role: "owner", status: "active" };
  let updated;
  const { env, secret } = createEnv(owner, undefined, (sql, values) => {
    updated = { sql, values };
    return { success: true, meta: { changes: 1 } };
  });
  const response = await callRoute(env, secret, owner, "POST", {
    action: "set_status", userId: "user-1", status: "disabled"
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.user.status, "disabled");
  assert.deepEqual(updated.values, ["disabled", "user-1"]);
  assert.match(updated.sql, /role = 'user'/);
});

test("a normal user cannot list or manage accounts", async () => {
  const user = { id: "user-1", display_name: "Sample", role: "user", status: "active" };
  const { env, secret } = createEnv(user);
  const response = await callRoute(env, secret, user, "POST", {
    action: "set_status", userId: "user-2", status: "disabled"
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).success, false);
});

test("the owner account cannot be disabled from account management", async () => {
  const owner = { id: "owner", display_name: "مالک", role: "owner", status: "active" };
  const { env, secret } = createEnv(owner);
  const response = await callRoute(env, secret, owner, "POST", {
    action: "set_status", userId: "owner", status: "disabled"
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /مالک/);
});
