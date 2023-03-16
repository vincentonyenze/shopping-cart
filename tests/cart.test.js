import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_CART,
  MAX_PER_PRODUCT,
  quantityOf,
  itemCount,
  maxQuantity,
  addToCart,
  setQuantity,
  removeFromCart,
  restoreItem,
} from "../js/cart.js";

const product = (id, stock = 50) => ({ id, name: `Product ${id}`, stock });

const phone = product(1, 50);
const lamp = product(2, 3); // only 3 left
const soldOut = product(3, 0);

// Add several things in one go: cartWith([phone, 2], [lamp, 1])
function cartWith(...entries) {
  return entries.reduce((cart, [p, amount]) => addToCart(cart, p, amount).cart, EMPTY_CART);
}

describe("reading", () => {
  test("an empty cart has nothing in it", () => {
    assert.equal(itemCount(EMPTY_CART), 0);
    assert.equal(quantityOf(EMPTY_CART, 1), 0);
  });

  test("counts every unit, not every product", () => {
    assert.equal(itemCount(cartWith([phone, 2], [lamp, 1])), 3);
  });

  test("the most you can have is the stock, up to the per-order limit", () => {
    assert.equal(maxQuantity(lamp), 3);
    assert.equal(maxQuantity(phone), MAX_PER_PRODUCT);
    assert.equal(maxQuantity(soldOut), 0);
  });
});

describe("addToCart", () => {
  test("adds a new product with a quantity of 1", () => {
    const { cart, added, limitedBy } = addToCart(EMPTY_CART, phone);
    assert.deepEqual(cart.items, [{ productId: 1, quantity: 1 }]);
    assert.equal(added, 1);
    assert.equal(limitedBy, null);
  });

  test("adding it again increases the quantity instead of adding a second line", () => {
    const cart = cartWith([phone, 1], [phone, 1]);
    assert.deepEqual(cart.items, [{ productId: 1, quantity: 2 }]);
  });

  test("keeps products in the order they were first added", () => {
    const cart = cartWith([phone, 1], [lamp, 1], [phone, 1]);
    assert.deepEqual(cart.items.map((item) => item.productId), [1, 2]);
  });

  test("can't add something that's sold out", () => {
    const result = addToCart(EMPTY_CART, soldOut);
    assert.equal(result.added, 0);
    assert.equal(result.limitedBy, "sold-out");
    assert.deepEqual(result.cart, EMPTY_CART);
  });

  test("stops at the stock, and says so", () => {
    const result = addToCart(cartWith([lamp, 2]), lamp, 5);
    assert.equal(quantityOf(result.cart, 2), 3);
    assert.equal(result.added, 1);
    assert.equal(result.limitedBy, "stock");
  });

  test(`stops at ${MAX_PER_PRODUCT} per order, and says so`, () => {
    const result = addToCart(cartWith([phone, MAX_PER_PRODUCT]), phone);
    assert.equal(result.added, 0);
    assert.equal(result.limitedBy, "max-per-order");
  });

  test("doesn't change the cart it was given", () => {
    const before = cartWith([phone, 1]);
    addToCart(before, phone);
    assert.equal(quantityOf(before, 1), 1);
  });
});

describe("setQuantity", () => {
  test("sets an exact quantity", () => {
    const { cart } = setQuantity(cartWith([phone, 1]), phone, 4);
    assert.equal(quantityOf(cart, 1), 4);
  });

  test("keeps it to the stock", () => {
    const { cart, limitedBy } = setQuantity(cartWith([lamp, 1]), lamp, 9);
    assert.equal(quantityOf(cart, 2), 3);
    assert.equal(limitedBy, "stock");
  });

  test("0 removes the product", () => {
    const { cart } = setQuantity(cartWith([phone, 2]), phone, 0);
    assert.deepEqual(cart.items, []);
  });

  test("ignores something that isn't a number", () => {
    const before = cartWith([phone, 2]);
    assert.equal(setQuantity(before, phone, NaN).cart, before);
  });

  test("drops fractions: 2.7 becomes 2", () => {
    const { cart } = setQuantity(cartWith([phone, 1]), phone, 2.7);
    assert.equal(quantityOf(cart, 1), 2);
  });

  test("removes a product that sold out while it was in the cart", () => {
    const cart = cartWith([phone, 2]);
    const nowSoldOut = { ...phone, stock: 0 };
    const result = setQuantity(cart, nowSoldOut, 2);
    assert.deepEqual(result.cart.items, []);
    assert.equal(result.limitedBy, "sold-out");
  });

  test("does nothing for a product that isn't in the cart", () => {
    const before = cartWith([phone, 1]);
    assert.deepEqual(setQuantity(before, lamp, 2).cart, before);
  });
});

describe("removing and undoing", () => {
  test("removes a product and says what and where it was", () => {
    const { cart, removed, index } = removeFromCart(cartWith([phone, 2], [lamp, 1]), 1);
    assert.deepEqual(cart.items, [{ productId: 2, quantity: 1 }]);
    assert.deepEqual(removed, { productId: 1, quantity: 2 });
    assert.equal(index, 0);
  });

  test("removing something that isn't there changes nothing", () => {
    const before = cartWith([phone, 1]);
    assert.equal(removeFromCart(before, 99).cart, before);
  });

  test("undo puts it back in the same place", () => {
    const start = cartWith([phone, 2], [lamp, 1]);
    const { cart, removed, index } = removeFromCart(start, 1);
    assert.deepEqual(restoreItem(cart, removed, index), start);
  });

  test("undo after adding the same product again doesn't make two lines", () => {
    const { cart, removed, index } = removeFromCart(cartWith([phone, 3]), 1);
    const readded = addToCart(cart, phone).cart;
    const restored = restoreItem(readded, removed, index);
    assert.deepEqual(restored.items, [{ productId: 1, quantity: 3 }]);
  });
});
