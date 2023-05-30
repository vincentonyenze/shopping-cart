// Saving the cart in localStorage, and bringing it back safely.
//
// A saved cart can be days old. Since then a product may have been
// removed from the shop, sold out, run low, or changed price. So a saved
// cart is never used as it is: it's checked against today's catalog first,
// fixed where needed, and every fix is reported so the shopper can be told.
//
// The pure parts (parse, reconcile, describe) are tested in
// tests/saved-cart.test.js. Only load/save touch storage.
import { EMPTY_CART, MAX_PER_PRODUCT, maxQuantity } from "./cart.js";
import { finalPriceCents, formatPrice } from "./format.js";

export const STORAGE_KEY = "shop:cart";

// ===== Saving =====
// What goes into storage. Alongside the items, the price each product
// had when the cart was saved, to notice price changes next time.
export function serializeCart(cart, promoCode, productsById) {
  const prices = {};
  for (const item of cart.items) {
    const product = productsById.get(item.productId);
    if (product) prices[item.productId] = finalPriceCents(product);
  }
  return JSON.stringify({ items: cart.items, promoCode, prices });
}

// ===== Reading back =====
// Text from storage -> something safe to work with. Anything damaged is
// dropped instead of breaking the page.
//   -> { items: [{ productId, quantity }], promoCode, prices }
export function parseSavedCart(text) {
  const empty = { items: [], promoCode: null, prices: {} };
  let saved;
  try {
    saved = JSON.parse(text);
  } catch {
    return empty;
  }
  if (!saved || typeof saved !== "object" || !Array.isArray(saved.items)) return empty;

  const seen = new Set();
  const items = [];
  for (const item of saved.items) {
    const valid =
      Number.isInteger(item?.productId) &&
      Number.isInteger(item?.quantity) &&
      item.quantity >= 1;
    // The same product twice would make two lines for one product
    if (!valid || seen.has(item.productId)) continue;
    seen.add(item.productId);
    items.push({ productId: item.productId, quantity: Math.min(item.quantity, MAX_PER_PRODUCT) });
  }

  const prices = saved.prices && typeof saved.prices === "object" ? saved.prices : {};
  const promoCode = typeof saved.promoCode === "string" && saved.promoCode ? saved.promoCode : null;
  return { items, promoCode, prices };
}

// Check a saved cart against today's catalog.
//   -> { cart, promoCode, changes }
// changes: what had to be fixed, one entry per product:
//   { type: "gone",    productId }                    no longer sold
//   { type: "sold-out", name }                         removed: none left
//   { type: "reduced", name, from, to }                fewer left than you had
//   { type: "price",   name, fromCents, toCents }      the price changed
export function reconcileSavedCart(saved, productsById) {
  const items = [];
  const changes = [];

  for (const item of saved.items) {
    const product = productsById.get(item.productId);
    if (!product) {
      changes.push({ type: "gone", productId: item.productId });
      continue;
    }

    const max = maxQuantity(product);
    if (max === 0) {
      changes.push({ type: "sold-out", name: product.name });
      continue;
    }

    let quantity = item.quantity;
    if (quantity > max) {
      changes.push({ type: "reduced", name: product.name, from: quantity, to: max });
      quantity = max;
    }

    const savedPrice = saved.prices[item.productId];
    const nowPrice = finalPriceCents(product);
    if (Number.isInteger(savedPrice) && savedPrice !== nowPrice) {
      changes.push({ type: "price", name: product.name, fromCents: savedPrice, toCents: nowPrice });
    }

    items.push({ productId: item.productId, quantity });
  }

  return { cart: { ...EMPTY_CART, items }, promoCode: saved.promoCode, changes };
}

// The changes, as sentences for the notice at the top of the cart
export function describeChanges(changes) {
  return changes.map((change) => {
    switch (change.type) {
      case "gone":
        return "An item in your cart is no longer available and was removed.";
      case "sold-out":
        return `${change.name} sold out and was removed.`;
      case "reduced":
        return `Only ${change.to} of ${change.name} left, so your cart now has ${change.to} (you had ${change.from}).`;
      case "price": {
        const direction = change.toCents < change.fromCents ? "dropped" : "went up";
        return `The price of ${change.name} ${direction} from ${formatPrice(change.fromCents)} to ${formatPrice(change.toCents)}.`;
      }
      default:
        return "";
    }
  });
}

// ===== Storage =====
export function loadSavedCart() {
  try {
    return parseSavedCart(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseSavedCart(null); // storage blocked: start empty
  }
}

export function saveCart(cart, promoCode, productsById) {
  try {
    localStorage.setItem(STORAGE_KEY, serializeCart(cart, promoCode, productsById));
  } catch (error) {
    // Full or blocked: the cart still works, it just won't survive a refresh
    console.warn("Couldn't save the cart:", error.message);
  }
}
