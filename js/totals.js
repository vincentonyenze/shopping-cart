// Working out what the cart costs. Pure: a cart and the catalog's products
// in, every number the checkout needs out. Tested in tests/totals.test.js.
//
// Everything is in whole CENTS from start to finish. Only the display turns
// cents into "$12.34". That way 3 × $19.99 is exactly 5997 cents, never
// 59.970000000000006 dollars.
import { finalPriceCents } from "./format.js";

// Orders of $50 or more ship free; anything smaller costs a flat $5.99
export const FREE_SHIPPING_FROM_CENTS = 5000;
export const SHIPPING_CENTS = 599;

// Sales tax, charged on the goods (not on shipping), as a fraction
export const TAX_RATE = 0.08;

// productsById: a Map of id -> product, for instant lookups
export function calculateTotals(cart, productsById) {
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

  const qualifiesForFreeShipping = subtotalCents >= FREE_SHIPPING_FROM_CENTS;
  const shippingCents = subtotalCents === 0 || qualifiesForFreeShipping ? 0 : SHIPPING_CENTS;

  // Tax is worked out ONCE on the whole subtotal and rounded once. Rounding
  // every line separately can make the total a cent or two different from
  // what the shopper would calculate themselves.
  const taxCents = Math.round(subtotalCents * TAX_RATE);

  return {
    lines,
    missing,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    subtotalCents,
    savingsCents,
    shippingCents,
    // For "Add $12.50 more for free shipping"
    freeShippingRemainingCents: Math.max(0, FREE_SHIPPING_FROM_CENTS - subtotalCents),
    taxCents,
    totalCents: subtotalCents + shippingCents + taxCents,
  };
}
