// Working out what the cart costs. Pure: a cart and the catalog's products
// in, every number the checkout needs out. Tested in tests/totals.test.js.
//
// Everything is in whole CENTS from start to finish. Only the display turns
// cents into "$12.34". That way 3 × $19.99 is exactly 5997 cents, never
// 59.970000000000006 dollars.
import { finalPriceCents } from "./format.js";
import { checkPromo, promoDiscountCents } from "./promos.js";

// Orders of $50 or more ship free; anything smaller costs a flat $5.99
export const FREE_SHIPPING_FROM_CENTS = 5000;
export const SHIPPING_CENTS = 599;

// Sales tax, charged on the goods (not on shipping), as a fraction
export const TAX_RATE = 0.08;

// productsById: a Map of id -> product, for instant lookups
// promoCode: a code the shopper applied (e.g. "SAVE10"), or null
export function calculateTotals(cart, productsById, promoCode = null) {
  const lines = [];
  // Products in the cart that the catalog no longer has (Step 10 tells
  // the shopper about these)
  const missing = [];

  for (const item of cart.items) {
    const product = productsById.get(item.productId);
    if (!product) {
      missing.push(item.productId);
      continue;
    }
    const unitCents = finalPriceCents(product);
    lines.push({
      product,
      quantity: item.quantity,
      unitCents,
      lineCents: unitCents * item.quantity,
      // How much the shop's discount saves on this line
      savingsCents: (product.priceCents - unitCents) * item.quantity,
    });
  }

  const sum = (key) => lines.reduce((total, line) => total + line[key], 0);
  const subtotalCents = sum("lineCents");
  const savingsCents = sum("savingsCents");

  // The promo is checked again on EVERY calculation, not just when it was
  // typed in: take things out of the cart and SAVE10 can stop qualifying.
  // promo: null (no code), or the result of checkPromo()
  const promo = promoCode ? checkPromo(promoCode, subtotalCents) : null;
  const promoCents = promo?.ok ? promoDiscountCents(promo.promo, subtotalCents) : 0;
  const freeShippingPromo = Boolean(promo?.ok && promo.promo.type === "shipping");

  // Free shipping is earned on the subtotal BEFORE a promo code, so a code
  // never makes you lose free shipping
  const qualifiesForFreeShipping = subtotalCents >= FREE_SHIPPING_FROM_CENTS || freeShippingPromo;
  const shippingCents = subtotalCents === 0 || qualifiesForFreeShipping ? 0 : SHIPPING_CENTS;

  // Tax is worked out ONCE on what's actually being paid for the goods
  // (after the promo), and rounded once. Rounding every line separately can
  // make the total a cent or two different from what the shopper would
  // calculate themselves.
  const taxableCents = subtotalCents - promoCents;
  const taxCents = Math.round(taxableCents * TAX_RATE);

  return {
    lines,
    missing,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    subtotalCents,
    savingsCents,
    promo,
    promoCents,
    shippingCents,
    // What the promo saved on shipping (FREESHIP on a small order)
    shippingSavedCents: freeShippingPromo && subtotalCents > 0 && subtotalCents < FREE_SHIPPING_FROM_CENTS
      ? SHIPPING_CENTS
      : 0,
    // For "Add $12.50 more for free shipping" (0 once shipping is free)
    freeShippingRemainingCents: qualifiesForFreeShipping
      ? 0
      : Math.max(0, FREE_SHIPPING_FROM_CENTS - subtotalCents),
    taxCents,
    totalCents: taxableCents + shippingCents + taxCents,
  };
}
