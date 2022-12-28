import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { formatPrice, finalPriceCents, starText, formatCount, stockLabel } from "../js/format.js";

describe("formatPrice", () => {
  test("turns cents into dollars", () => {
    assert.equal(formatPrice(11349), "$113.49");
  });

  test("always shows two decimal places", () => {
    assert.equal(formatPrice(900), "$9.00");
  });

  test("adds a thousands separator", () => {
    assert.equal(formatPrice(144095), "$1,440.95");
  });
});

describe("finalPriceCents", () => {
  test("is the normal price when there's no discount", () => {
    assert.equal(finalPriceCents({ priceCents: 8999, discountPercent: 0 }), 8999);
  });

  test("takes the discount off", () => {
    // 20% off $50.00 is $40.00
    assert.equal(finalPriceCents({ priceCents: 5000, discountPercent: 20 }), 4000);
  });

  test("rounds to a whole cent", () => {
    // 20% off $89.99 = $71.992 -> $71.99
    assert.equal(finalPriceCents({ priceCents: 8999, discountPercent: 20 }), 7199);
  });
});

describe("starText", () => {
  test("rounds to the nearest whole star", () => {
    assert.equal(starText(4.4), "★★★★☆");
    assert.equal(starText(4.5), "★★★★★");
  });

  test("always shows five stars in total", () => {
    for (const rating of [0, 1.2, 2.7, 3.5, 5]) {
      assert.equal([...starText(rating)].length, 5);
    }
  });

  test("never goes outside 0 to 5", () => {
    assert.equal(starText(7), "★★★★★");
    assert.equal(starText(-1), "☆☆☆☆☆");
  });
});

describe("formatCount", () => {
  test("adds a thousands separator", () => {
    assert.equal(formatCount(2400), "2,400");
  });
});

describe("stockLabel", () => {
  test("says when something is out of stock", () => {
    assert.deepEqual(stockLabel(0), { text: "Out of stock", level: "none" });
  });

  test("warns when only a few are left", () => {
    assert.deepEqual(stockLabel(3), { text: "Only 3 left", level: "low" });
  });

  test("says in stock otherwise", () => {
    assert.deepEqual(stockLabel(119), { text: "In stock", level: "ok" });
  });
});
