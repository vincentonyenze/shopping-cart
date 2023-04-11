// Promo codes: what each one does, and whether it can be used.
// Pure functions, tested in tests/promos.test.js.
//
// In a real shop these live on the SERVER, which also checks them at
// checkout. Anything in the browser can be read in DevTools: here, anyone
// can open this file and see every code. That's fine for practice, but
// never ship real discount codes in frontend code.

export const PROMOS = {
  SAVE10: {
    type: "percent",
    percent: 10,
    minSubtotalCents: 3000,
    description: "10% off orders of $30 or more",
  },
  WELCOME5: {
    type: "fixed",
    amountCents: 500,
    minSubtotalCents: 2000,
    description: "$5 off orders of $20 or more",
  },
  FREESHIP: {
    type: "shipping",
    minSubtotalCents: 0,
    description: "Free shipping on any order",
  },
};

// What people type is messy: " save10 ", "Save 10" -> "SAVE10"
export function normalizeCode(text) {
  return String(text ?? "").replace(/\s+/g, "").toUpperCase();
}

// Can this code be used on a cart with this subtotal?
//   -> { ok: true, code, promo }
//   -> { ok: false, reason: "empty" | "unknown" }
//   -> { ok: false, reason: "minimum", code, promo, shortByCents }
export function checkPromo(text, subtotalCents) {
  const code = normalizeCode(text);
  if (code === "") return { ok: false, reason: "empty" };

  // Object.hasOwn, not PROMOS[code]: a code like "TOSTRING" would otherwise
  // find the toString function every object inherits
  if (!Object.hasOwn(PROMOS, code)) return { ok: false, reason: "unknown", code };

  const promo = PROMOS[code];
  if (subtotalCents < promo.minSubtotalCents) {
    return {
      ok: false,
      reason: "minimum",
      code,
      promo,
      shortByCents: promo.minSubtotalCents - subtotalCents,
    };
  }
  return { ok: true, code, promo };
}

// How much a promo takes off the goods (in cents). Free shipping doesn't
// change the goods, so it's 0 here; calculateTotals() handles the shipping.
export function promoDiscountCents(promo, subtotalCents) {
  if (promo.type === "percent") return Math.round((subtotalCents * promo.percent) / 100);
  // A $5 code on a $3 cart takes off $3, never more than there is
  if (promo.type === "fixed") return Math.min(promo.amountCents, subtotalCents);
  return 0;
}
