import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PROMOS, normalizeCode, checkPromo, promoDiscountCents } from "../js/promos.js";
import { calculateTotals, SHIPPING_CENTS } from "../js/totals.js";

describe("normalizeCode", () => {
  test("ignores case and spaces", () => {
    assert.equal(normalizeCode("  save 10 "), "SAVE10");
  });

  test("copes with nothing at all", () => {
    assert.equal(normalizeCode(null), "");
  });
});

describe("checkPromo", () => {
  test("accepts a code the cart qualifies for", () => {
    const result = checkPromo("save10", 4000);
    assert.equal(result.ok, true);
    assert.equal(result.code, "SAVE10");
  });

  test("says when nothing was typed", () => {
    assert.deepEqual(checkPromo("  ", 4000), { ok: false, reason: "empty" });
  });

  test("rejects a code that doesn't exist", () => {
    assert.equal(checkPromo("FREEMONEY", 4000).reason, "unknown");
  });

  test("isn't fooled by names every object has", () => {
    assert.equal(checkPromo("toString", 4000).reason, "unknown");
    assert.equal(checkPromo("constructor", 4000).reason, "unknown");
  });

  test("says how much more is needed for the minimum", () => {
    const result = checkPromo("SAVE10", 2600);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "minimum");
    assert.equal(result.shortByCents, 400);
  });

  test("accepts exactly the minimum", () => {
    assert.equal(checkPromo("SAVE10", 3000).ok, true);
  });
});

describe("promoDiscountCents", () => {
  test("a percent code takes that share off, rounded to a cent", () => {
    // 10% of $45.67 = $4.567 -> $4.57
    assert.equal(promoDiscountCents(PROMOS.SAVE10, 4567), 457);
  });

  test("a fixed code takes its amount off", () => {
    assert.equal(promoDiscountCents(PROMOS.WELCOME5, 2500), 500);
  });

  test("a fixed code never takes off more than the cart costs", () => {
    assert.equal(promoDiscountCents({ type: "fixed", amountCents: 500 }, 300), 300);
  });

  test("free shipping takes nothing off the goods", () => {
    assert.equal(promoDiscountCents(PROMOS.FREESHIP, 2500), 0);
  });
});

describe("calculateTotals with a promo", () => {
  const product = (id, priceCents) => ({ id, name: `P${id}`, priceCents, discountPercent: 0, stock: 50 });
  const catalog = new Map([[1, product(1, 2000)], [2, product(2, 1000)]]); // $20, $10
  const cart = (...items) => ({ items: items.map(([productId, quantity]) => ({ productId, quantity })) });

  test("no code: no discount", () => {
    const totals = calculateTotals(cart([1, 2]), catalog);
    assert.equal(totals.promo, null);
    assert.equal(totals.promoCents, 0);
  });

  test("SAVE10 takes 10% off, and tax is on the lower amount", () => {
    // $40 subtotal - $4 = $36; tax 8% of $36 = $2.88; free shipping? no ($40 < $50)
    const totals = calculateTotals(cart([1, 2]), catalog, "SAVE10");
    assert.equal(totals.promoCents, 400);
    assert.equal(totals.taxCents, 288);
    assert.equal(totals.totalCents, 3600 + SHIPPING_CENTS + 288);
  });

  test("FREESHIP removes the shipping charge", () => {
    const totals = calculateTotals(cart([2, 1]), catalog, "FREESHIP");
    assert.equal(totals.shippingCents, 0);
    assert.equal(totals.shippingSavedCents, SHIPPING_CENTS);
    assert.equal(totals.freeShippingRemainingCents, 0);
  });

  test("a promo never loses you free shipping you'd already earned", () => {
    // $60 qualifies for free shipping; SAVE10 makes it $54, still free
    const totals = calculateTotals(cart([1, 3]), catalog, "SAVE10");
    assert.equal(totals.shippingCents, 0);
  });

  test("a code stops working if the cart drops below its minimum", () => {
    const totals = calculateTotals(cart([2, 2]), catalog, "SAVE10"); // $20 < $30
    assert.equal(totals.promo.ok, false);
    assert.equal(totals.promo.reason, "minimum");
    assert.equal(totals.promoCents, 0);
  });

  test("every amount stays a whole number of cents", () => {
    const totals = calculateTotals(cart([1, 3], [2, 7]), catalog, "SAVE10");
    for (const key of ["promoCents", "taxCents", "totalCents"]) {
      assert.ok(Number.isInteger(totals[key]), `${key} is ${totals[key]}`);
    }
  });
});
