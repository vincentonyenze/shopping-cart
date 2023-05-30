import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  serializeCart,
  parseSavedCart,
  reconcileSavedCart,
  describeChanges,
} from "../js/saved-cart.js";

const product = (id, overrides = {}) => ({
  id,
  name: `Product ${id}`,
  priceCents: 1000,
  discountPercent: 0,
  stock: 50,
  ...overrides,
});

const catalogOf = (...products) => new Map(products.map((p) => [p.id, p]));
const savedOf = (items, prices = {}, promoCode = null) => ({ items, prices, promoCode });

describe("serializeCart + parseSavedCart", () => {
  test("a saved cart comes back the same (a round trip)", () => {
    const cart = { items: [{ productId: 1, quantity: 2 }] };
    const text = serializeCart(cart, "SAVE10", catalogOf(product(1)));
    assert.deepEqual(parseSavedCart(text), {
      items: [{ productId: 1, quantity: 2 }],
      promoCode: "SAVE10",
      prices: { 1: 1000 },
    });
  });

  test("saves the price you'd actually pay (after sales)", () => {
    const cart = { items: [{ productId: 1, quantity: 1 }] };
    const text = serializeCart(cart, null, catalogOf(product(1, { discountPercent: 20 })));
    assert.equal(JSON.parse(text).prices[1], 800);
  });
});

describe("parseSavedCart", () => {
  const EMPTY = { items: [], promoCode: null, prices: {} };

  test("is empty when nothing was saved", () => {
    assert.deepEqual(parseSavedCart(null), EMPTY);
  });

  test("is empty for damaged text", () => {
    assert.deepEqual(parseSavedCart("{oops"), EMPTY);
    assert.deepEqual(parseSavedCart("[1,2,3]"), EMPTY);
    assert.deepEqual(parseSavedCart('{"items":"lots"}'), EMPTY);
  });

  test("drops damaged items and keeps the good ones", () => {
    const text = JSON.stringify({
      items: [
        { productId: 1, quantity: 2 },
        { productId: "7", quantity: 1 }, // id isn't a number
        { productId: 2, quantity: 0 }, // nothing to keep
        { productId: 3, quantity: 1.5 }, // half a product?
        null,
      ],
    });
    assert.deepEqual(parseSavedCart(text).items, [{ productId: 1, quantity: 2 }]);
  });

  test("keeps only the first line for a product that appears twice", () => {
    const text = JSON.stringify({ items: [{ productId: 1, quantity: 2 }, { productId: 1, quantity: 5 }] });
    assert.deepEqual(parseSavedCart(text).items, [{ productId: 1, quantity: 2 }]);
  });

  test("never allows more than the per-order limit", () => {
    const text = JSON.stringify({ items: [{ productId: 1, quantity: 500 }] });
    assert.equal(parseSavedCart(text).items[0].quantity, 10);
  });
});

describe("reconcileSavedCart", () => {
  test("a cart that still matches the catalog comes back unchanged", () => {
    const result = reconcileSavedCart(
      savedOf([{ productId: 1, quantity: 2 }], { 1: 1000 }, "SAVE10"),
      catalogOf(product(1))
    );
    assert.deepEqual(result.cart.items, [{ productId: 1, quantity: 2 }]);
    assert.equal(result.promoCode, "SAVE10");
    assert.deepEqual(result.changes, []);
  });

  test("removes products the shop doesn't sell any more", () => {
    const result = reconcileSavedCart(savedOf([{ productId: 99, quantity: 1 }]), catalogOf(product(1)));
    assert.deepEqual(result.cart.items, []);
    assert.deepEqual(result.changes, [{ type: "gone", productId: 99 }]);
  });

  test("removes products that sold out", () => {
    const result = reconcileSavedCart(
      savedOf([{ productId: 1, quantity: 1 }]),
      catalogOf(product(1, { stock: 0 }))
    );
    assert.deepEqual(result.cart.items, []);
    assert.equal(result.changes[0].type, "sold-out");
  });

  test("lowers a quantity to what's left in stock", () => {
    const result = reconcileSavedCart(
      savedOf([{ productId: 1, quantity: 5 }]),
      catalogOf(product(1, { stock: 2 }))
    );
    assert.deepEqual(result.cart.items, [{ productId: 1, quantity: 2 }]);
    assert.deepEqual(result.changes, [{ type: "reduced", name: "Product 1", from: 5, to: 2 }]);
  });

  test("notices a price change, but keeps the product", () => {
    const result = reconcileSavedCart(
      savedOf([{ productId: 1, quantity: 1 }], { 1: 1200 }),
      catalogOf(product(1))
    );
    assert.equal(result.cart.items.length, 1);
    assert.deepEqual(result.changes, [{ type: "price", name: "Product 1", fromCents: 1200, toCents: 1000 }]);
  });

  test("keeps the cart's order", () => {
    const result = reconcileSavedCart(
      savedOf([{ productId: 2, quantity: 1 }, { productId: 1, quantity: 1 }]),
      catalogOf(product(1), product(2))
    );
    assert.deepEqual(result.cart.items.map((item) => item.productId), [2, 1]);
  });
});

describe("describeChanges", () => {
  test("explains each kind of change in a sentence", () => {
    const sentences = describeChanges([
      { type: "gone", productId: 9 },
      { type: "sold-out", name: "Lamp" },
      { type: "reduced", name: "Mug", from: 5, to: 2 },
      { type: "price", name: "Book", fromCents: 1500, toCents: 1200 },
      { type: "price", name: "Pen", fromCents: 100, toCents: 150 },
    ]);
    assert.deepEqual(sentences, [
      "An item in your cart is no longer available and was removed.",
      "Lamp sold out and was removed.",
      "Only 2 of Mug left, so your cart now has 2 (you had 5).",
      "The price of Book dropped from $15.00 to $12.00.",
      "The price of Pen went up from $1.00 to $1.50.",
    ]);
  });
});
