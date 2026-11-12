import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemInstruction } from "../modules/navi.js";

const common = {
  page: "/navi",
  pageContext: "",
  memoryContext: "No relevant approved memory is available.",
  conversationContext: ""
};

test("NAVI prompt identifies the authenticated owner account as the owner", () => {
  const prompt = buildSystemInstruction({
    ...common,
    currentUser: { id: "owner", display_name: "مالک", role: "owner" }
  });

  assert.match(prompt, /authenticated account is the NAVA platform owner and creator/);
  assert.match(prompt, /Role: platform owner/);
  assert.doesNotMatch(prompt, /This person is NOT the NAVA platform owner/);
});

test("NAVI prompt identifies an invited user as separate from the platform owner", () => {
  const prompt = buildSystemInstruction({
    ...common,
    currentUser: { id: "user-123", display_name: "کاربر آزمایشی", role: "user" }
  });

  assert.match(prompt, /regular invited user \(role: user\)/);
  assert.match(prompt, /This person is NOT the NAVA platform owner or creator/);
  assert.match(prompt, /the platform owner is a separate person\/account/);
  assert.match(prompt, /If this user asks about "the owner" or "the owner's project"/);
  assert.match(prompt, /Role: regular user; not the platform owner/);
  assert.doesNotMatch(prompt, /The user is the owner and creator of the NAVA project/);
  assert.match(prompt, /do not rephrase the question as being about this user/);
});

test("unknown or missing roles fail closed as a regular user", () => {
  const prompt = buildSystemInstruction({
    ...common,
    currentUser: { id: "user-unknown", display_name: "Guest", role: "unexpected" }
  });

  assert.match(prompt, /This person is NOT the NAVA platform owner or creator/);
  assert.match(prompt, /Role: regular user; not the platform owner/);
});
