import test from "node:test";
import assert from "node:assert/strict";

import {
  areMemoryValuesSemanticallySimilar,
  parseNaviMemoryCommand
} from "../modules/navi-memory.js";

test("a changed Persian favorite color is recognized as the same fact", () => {
  assert.equal(
    areMemoryValuesSemanticallySimilar(
      "رنگ مورد علاقه‌ام قرمز است",
      "رنگ مورد علاقه‌ام آبی است"
    ),
    true
  );
});

test("colloquial possessive forms still match the same memory topic", () => {
  assert.equal(
    areMemoryValuesSemanticallySimilar(
      "رنگم قرمز است",
      "رنگم آبی است"
    ),
    true
  );
});

test("unrelated facts are not treated as corrections", () => {
  assert.equal(
    areMemoryValuesSemanticallySimilar(
      "رنگ مورد علاقه‌ام قرمز است",
      "من در تهران زندگی می‌کنم"
    ),
    false
  );
});

test("remember command extracts the fact instead of saving the instruction", () => {
  const parsed = parseNaviMemoryCommand(
    "رنگ مورد علاقه‌ام قرمز است. این را به خاطر بسپار"
  );

  assert.equal(parsed.isCommand, true);
  assert.equal(parsed.command, "remember");
  assert.match(parsed.value, /رنگ مورد علاقه/);
  assert.match(parsed.value, /قرمز/);
  assert.doesNotMatch(parsed.value, /به خاطر بسپار/);
});
