// Turning product data into text for people. No DOM, so it's tested in
// tests/format.test.js.
//
// Prices are stored as whole cents (11349 = $113.49) so adding and
// comparing them never hits floating-point errors (0.1 + 0.2 = 0.30000000000000004).
// They only become dollars here, at the very end, for display.

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// 11349 -> "$113.49", 900 -> "$9.00", 144095 -> "$1,440.95"
export function formatPrice(cents) {
  return dollars.format(cents / 100);
}

// The price you'd actually pay: 20% off 8999 cents is 7199 cents.
// Rounded to a whole cent, because there's no such thing as 0.2 of a cent.
export function finalPriceCents(product) {
  return Math.round((product.priceCents * (100 - product.discountPercent)) / 100);
}

// 4.4 -> "★★★★☆" (rounded to the nearest whole star, out of 5)
export function starText(rating) {
  const filled = Math.min(5, Math.max(0, Math.round(rating)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

// 1234 -> "1,234"
export function formatCount(count) {
  return count.toLocaleString("en-US");
}

// What the card says about stock, and how worried it should look
export function stockLabel(stock) {
  if (stock === 0) return { text: "Out of stock", level: "none" };
  if (stock <= 5) return { text: `Only ${stock} left`, level: "low" };
  return { text: "In stock", level: "ok" };
}
