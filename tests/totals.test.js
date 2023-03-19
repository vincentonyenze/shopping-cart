import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateTotals,
  FREE_SHIPPING_FROM_CENTS,
  SHIPPING_CENTS,
  TAX_RATE,
} from "../js/totals.js";

const product = (id, priceCents, discountPercent = 0) => ({
  id,
  name: `Product ${id}`,
  priceCents,
  discountPercent,
  stock: 50,
});

const mug = product(1, 1999); // $19.99
const lamp = product(2, 4000, 25); // $40.00, 25% off = $30.00
const book = product(3, 1250); // $12.50

const catalog = new Map([mug, lamp, book].map((p) => [p.id, p]));
const cart = (...items) => ({
  items: items.map(([productId, quantity]) => ({ productId, quantity })),
});

describe("calculateTotals", () => {
  test("an empty cart costs nothing, not even shipping", () => {
    const totals = calculateTotals(cart(), catalog);
    assert.equal(totals.subtotalCents, 0);
    assert.equal(totals.shippingCents, 0);
    assert.equal(totals.taxCents, 0);
    assert.equal(totals.totalCents, 0);
    assert.equal(totals.itemCount, 0);
  });

  test("multiplies each price by its quantity, exactly", () => {
    // 3 × $19.99 = $59.97: exactly 5997 cents, no floating-point fuzz
    const totals = calculateTotals(cart([1, 3]), catalog);
    assert.equal(totals.lines[0].lineCents, 5997);
    assert.equal(totals.subtotalCents, 5997);
  });

  test("uses the sale price, and adds up what the sale saves", () => {
    // 2 lamps at $30 instead of $40: $60, saving $20
    const totals = calculateTotals(cart([2, 2]), catalog);
    assert.equal(totals.lines[0].unitCents, 3000);
    assert.equal(totals.subtotalCents, 6000);
    assert.equal(totals.savingsCents, 2000);
  });

  test(`charges $${SHIPPING_CENTS / 100} shipping under $${FREE_SHIPPING_FROM_CENTS / 100}`, () => {
    const totals = calculateTotals(cart([3, 1]), catalog); // $12.50
    assert.equal(totals.shippingCents, SHIPPING_CENTS);
    assert.equal(totals.freeShippingRemainingCents, 5000 - 1250);
  });

  test("ships free from exactly $50", () => {
    const totals = calculateTotals(cart([3, 4]), catalog); // 4 × $12.50 = $50.00
    assert.equal(totals.subtotalCents, 5000);
    assert.equal(totals.shippingCents, 0);
    assert.equal(totals.freeShippingRemainingCents, 0);
  });

  test(`adds ${TAX_RATE * 100}% tax on the goods, rounded to a cent`, () => {
    // $59.97 × 8% = $4.7976 -> $4.80
    const totals = calculateTotals(cart([1, 3]), catalog);
    assert.equal(totals.taxCents, 480);
  });

  test("doesn't charge tax on shipping", () => {
    // $12.50 × 8% = $1.00, whatever the shipping is
    assert.equal(calculateTotals(cart([3, 1]), catalog).taxCents, 100);
  });

  test("the total is subtotal + shipping + tax", () => {
    // $12.50 + $5.99 + $1.00 = $19.49
    const totals = calculateTotals(cart([3, 1]), catalog);
    assert.equal(totals.totalCents, 1250 + 599 + 100);
  });

  test("puts a whole cart together", () => {
    // 2 mugs $39.98 + 1 lamp $30.00 + 1 book $12.50 = $82.48
    // free shipping; tax 8% of 8248 = 659.84 -> 660; total 8908
    const totals = calculateTotals(cart([1, 2], [2, 1], [3, 1]), catalog);
    assert.equal(totals.itemCount, 4);
    assert.equal(totals.subtotalCents, 8248);
    assert.equal(totals.savingsCents, 1000);
    assert.equal(totals.shippingCents, 0);
    assert.equal(totals.taxCents, 660);
    assert.equal(totals.totalCents, 8908);
  });

  test("keeps the lines in the cart's order", () => {
    const totals = calculateTotals(cart([3, 1], [1, 1]), catalog);
    assert.deepEqual(totals.lines.map((line) => line.product.id), [3, 1]);
  });

  test("skips products the catalog doesn't have any more, and lists them", () => {
    const totals = calculateTotals(cart([1, 1], [99, 2]), catalog);
    assert.equal(totals.lines.length, 1);
    assert.deepEqual(totals.missing, [99]);
    assert.equal(totals.subtotalCents, 1999);
  });

  test("every amount is a whole number of cents", () => {
    const totals = calculateTotals(cart([1, 7], [2, 3], [3, 9]), catalog);
    for (const key of ["subtotalCents", "savingsCents", "shippingCents", "taxCents", "totalCents"]) {
      assert.ok(Number.isInteger(totals[key]), `${key} is ${totals[key]}`);
    }
  });
});
