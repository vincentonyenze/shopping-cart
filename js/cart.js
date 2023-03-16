// The cart "engine". Pure functions: a cart (and a product) in, a new cart
// out. No DOM, no storage, so it's tested in tests/cart.test.js.
//
// A cart only remembers WHICH products and HOW MANY:
//   { items: [{ productId: 121, quantity: 2 }, { productId: 7, quantity: 1 }] }
//
// Prices, names and stock are NOT copied in. They're always looked up in
// the catalog, so if a price changes, the cart shows the new one: the
// catalog stays the single source of truth. (Real shops also check the
// price again on the server at checkout, never trusting the browser.)

export const EMPTY_CART = { items: [] };

// Nobody needs 50 of the same lamp; it's usually a slip of the finger
export const MAX_PER_PRODUCT = 10;

// ===== Reading =====
export function quantityOf(cart, productId) {
  return cart.items.find((item) => item.productId === productId)?.quantity ?? 0;
}

// The number on the cart badge: 2 phones + 1 lamp = 3
export function itemCount(cart) {
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}

// The most of one product that can be in the cart: what's in stock, but
// never more than MAX_PER_PRODUCT
export function maxQuantity(product) {
  return Math.max(0, Math.min(product.stock, MAX_PER_PRODUCT));
}

// ===== Changing =====
// Every change returns { cart, ... } with a NEW cart, never changing the
// old one. The extra fields say what happened, so the page can explain.

// Add `amount` of a product (1 by default). If that would go over the
// limit, add as many as allowed and say why it stopped.
//   -> { cart, added: 1, limitedBy: null }
//   -> { cart, added: 0, limitedBy: "sold-out" }      out of stock
//   -> { cart, added: 0, limitedBy: "stock" }         you have all there is
//   -> { cart, added: 0, limitedBy: "max-per-order" } 10 is the most per order
export function addToCart(cart, product, amount = 1) {
  const current = quantityOf(cart, product.id);
  const max = maxQuantity(product);
  const wanted = current + amount;
  const quantity = Math.min(wanted, max);
  const added = Math.max(0, quantity - current);

  let limitedBy = null;
  if (added < amount) {
    if (product.stock === 0) limitedBy = "sold-out";
    else if (max === product.stock) limitedBy = "stock";
    else limitedBy = "max-per-order";
  }

  if (added === 0) return { cart, added, limitedBy };

  // Already in the cart: change its quantity, keeping its place in the list.
  // New: add it to the end.
  const items = current > 0
    ? cart.items.map((item) => (item.productId === product.id ? { ...item, quantity } : item))
    : [...cart.items, { productId: product.id, quantity }];

  return { cart: { ...cart, items }, added, limitedBy };
}

// Set an exact quantity (the − / + buttons, or a typed number).
// It's kept between 1 and the maximum; 0 or less removes the product.
export function setQuantity(cart, product, quantity) {
  if (!Number.isFinite(quantity)) return { cart, limitedBy: null };
  const whole = Math.floor(quantity);
  if (whole <= 0) return removeFromCart(cart, product.id);

  const max = maxQuantity(product);
  const clamped = Math.min(whole, max);
  const limitedBy = whole > max ? (max === product.stock ? "stock" : "max-per-order") : null;

  if (quantityOf(cart, product.id) === 0) return { cart, limitedBy };
  // It sold out while it was in the cart: there's nothing left to keep
  if (clamped === 0) return { ...removeFromCart(cart, product.id), limitedBy: "sold-out" };
  const items = cart.items.map((item) =>
    item.productId === product.id ? { ...item, quantity: clamped } : item
  );
  return { cart: { ...cart, items }, limitedBy };
}

// Take a product out. Also returns what was removed and where it was, so
// it can be put back with restoreItem() (the "Undo" button).
export function removeFromCart(cart, productId) {
  const index = cart.items.findIndex((item) => item.productId === productId);
  if (index === -1) return { cart, removed: null, index: -1 };
  return {
    cart: { ...cart, items: cart.items.filter((item) => item.productId !== productId) },
    removed: cart.items[index],
    index,
  };
}

// Put a removed item back in the same place. If the same product has been
// added again since, just make sure there's at least as many as before.
export function restoreItem(cart, item, index) {
  if (quantityOf(cart, item.productId) > 0) {
    const items = cart.items.map((existing) =>
      existing.productId === item.productId
        ? { ...existing, quantity: Math.max(existing.quantity, item.quantity) }
        : existing
    );
    return { ...cart, items };
  }
  const at = Math.min(Math.max(0, index), cart.items.length);
  return { ...cart, items: [...cart.items.slice(0, at), item, ...cart.items.slice(at)] };
}
