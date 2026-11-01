const test = require("node:test");
const assert = require("node:assert/strict");
const { isUuid, cleanText } = require("./http");

test("isUuid accepts a standard UUID", () => {
  assert.equal(isUuid("d9428888-122b-4a9a-bc4f-7c2d4f6b2e11"), true);
});
test("isUuid rejects malformed identifiers", () => {
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(""), false);
});
test("cleanText trims, collapses whitespace and enforces maximum length", () => {
  assert.equal(cleanText("  fresh   food \n boxes ", 30), "fresh food boxes");
  assert.equal(cleanText("abcdefgh", 4), "abcd");
  assert.equal(cleanText(null, 10), "");
});
