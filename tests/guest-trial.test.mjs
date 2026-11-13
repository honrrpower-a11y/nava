import test from "node:test";
import assert from "node:assert/strict";
import { createGuestVisitorHash, createGuestIpHash } from "../modules/guest-trial.js";

test("guest visitor identity is deterministic and secret-bound", async () => {
  const id = "2f8b7c1a-7e3d-4b9c-9a10-8f7c6d5e4a32";
  const first = await createGuestVisitorHash(id, "test-secret-key");
  assert.equal(first, await createGuestVisitorHash(id, "test-secret-key"));
  assert.notEqual(first, await createGuestVisitorHash("3f8b7c1a-7e3d-4b9c-9a10-8f7c6d5e4a32", "test-secret-key"));
  assert.notEqual(first, await createGuestVisitorHash(id, "another-secret-key"));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first.includes("2f8b7c1a"), false);
});

test("IP identity uses a separate HMAC namespace", async () => {
  const visitor = await createGuestVisitorHash("2f8b7c1a-7e3d-4b9c-9a10-8f7c6d5e4a32", "test-secret-key");
  const ip = await createGuestIpHash("203.0.113.10", "test-secret-key");
  assert.notEqual(visitor, ip);
  assert.notEqual(ip, await createGuestIpHash("203.0.113.11", "test-secret-key"));
});

test("guest trial identity rejects missing values", async () => {
  await assert.rejects(() => createGuestVisitorHash("", "test-secret-key"));
  await assert.rejects(() => createGuestVisitorHash("203.0.113.10", ""));
  await assert.rejects(() => createGuestIpHash("", "test-secret-key"));
});
