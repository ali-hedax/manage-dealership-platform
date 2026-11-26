import assert from "node:assert/strict";
import test from "node:test";
import { shortCarName } from "../normalize/car-name";
import { normalizeKey, normalizePersian } from "../normalize/persian";

test("normalizePersian normalizes Arabic letters and digits", () => {
  assert.equal(normalizePersian("  ي ك ١۲٣  "), "ی ک ۱۲۳");
  assert.equal(
    normalizePersian("كالا ١۲٣", { digits: "latin" }),
    "کالا 123",
  );
});

test("normalizePersian keeps ZWNJ and removes other bidi controls", () => {
  assert.equal(normalizePersian("سورن‌پلاس\u200F"), "سورن‌پلاس");
});

test("normalizeKey preserves leading zeros", () => {
  assert.equal(normalizeKey("07203037"), "07203037");
});

const knownDescriptions = [
  ["3220701 - 3221101 خودروي تارا با موتور TU5P ، گيربکسBE دستي", "تارا"],
  ["3230101خودروي تارا، با موتور TU5P، گيربکس اتومات 6 دنده DAE", "تارا"],
  ["۵۸۴۰۴۰۳ سورن‌پلاس با موتورXU۷P بنزینی", "سورن پلاس"],
  ["سورن پلاس بنزینی با موتور XU7P و گیربکس دستی BE", "سورن پلاس"],
  ["پژو 207i HB موتور TU5P گیربکس دستی BE", "پژو 207i"],
  ["تارا موتور TU5Pو گیربکس دستی", "تارا"],
] as const;

for (const [description, expectedName] of knownDescriptions) {
  test(`shortCarName recognizes ${expectedName}: ${description}`, () => {
    assert.deepEqual(shortCarName(description), {
      name: expectedName,
      matched: true,
    });
  });
}

test("shortCarName returns a review candidate for an unknown model", () => {
  assert.deepEqual(shortCarName("خودروی شاهین با گیربکس دستی"), {
    name: "شاهین",
    matched: false,
  });
});

test("shortCarName prefers the longest mapped model name", () => {
  assert.equal(shortCarName("دنا پلاس توربو").name, "دنا پلاس");
  assert.equal(shortCarName("سورن پلاس بنزینی").name, "سورن پلاس");
});
