// The catalog "engine": which products to show for the current query.
// Pure functions only (products and a query in, products out), tested in
// tests/catalog.test.js.
//
// A query looks like this (Step 9 adds the page number):
// {
//   sort: "price-asc",            one of SORT_OPTIONS
//   search: "wireless",
//   categories: ["electronics"],  empty = all categories
//   minPrice: 20, maxPrice: 100,  whole dollars, or null for no limit
//   minRating: 4,                 0 = any rating
//   inStock: true,                only things you can buy now
//   onSale: false,                only discounted things
// }
import { finalPriceCents } from "./format.js";

// "Lumière Perfume" -> "lumiere perfume"
// Lower case, and accents removed, so "lumiere" finds "Lumière".
// normalize("NFD") splits "è" into "e" + a separate accent mark, and the
// regex then removes the accent marks (Unicode range 0300–036F).
export function simplify(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Everything a search can match for one product, in one string
function searchableText(product, categoryNames) {
  return simplify(
    [
      product.name,
      product.brand,
      categoryNames[product.category] ?? product.category,
      ...product.tags,
    ].join(" ")
  );
}

// ===== One rule per filter =====
// Every word you type has to appear somewhere: "wireless audio" finds
// products that are wireless AND audio, in any order.
export function matchesSearch(product, query, categoryNames = {}) {
  const words = simplify(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true; // no search: everything matches
  const text = searchableText(product, categoryNames);
  return words.every((word) => text.includes(word));
}

// Ticked categories: show products in ANY of them ("Shoes or Clothing").
// None ticked means every category.
export function matchesCategories(product, categories) {
  return categories.length === 0 || categories.includes(product.category);
}

// Prices are compared with what you'd actually PAY (after any discount),
// in cents. min and max are whole dollars, or null for "no limit".
export function matchesPrice(product, minPrice, maxPrice) {
  const price = finalPriceCents(product);
  if (minPrice !== null && price < minPrice * 100) return false;
  if (maxPrice !== null && price > maxPrice * 100) return false;
  return true;
}

export function matchesRating(product, minRating) {
  return product.rating >= minRating;
}

export function matchesAvailability(product, { inStock, onSale }) {
  if (inStock && product.stock === 0) return false;
  if (onSale && product.discountPercent === 0) return false;
  return true;
}

// All the rules, each written the same way: (product, query, names) -> true/false.
// Adding a filter means adding one line here.
const RULES = [
  (product, query, names) => matchesSearch(product, query.search, names),
  (product, query) => matchesCategories(product, query.categories),
  (product, query) => matchesPrice(product, query.minPrice, query.maxPrice),
  (product, query) => matchesRating(product, query.minRating),
  (product, query) => matchesAvailability(product, query),
];

// The products to show for a query. A product has to pass EVERY rule.
export function getResults(products, query, categoryNames = {}) {
  return products.filter((product) =>
    RULES.every((rule) => rule(product, query, categoryNames))
  );
}

// How many products each category WOULD show, given everything else you've
// chosen. That's why the category filter itself is left out: ticking
// "Shoes" shouldn't make "Clothing" show 0.
//   -> { electronics: 3, clothing: 0, ... }
export function countByCategory(products, query, categoryNames = {}) {
  const counts = {};
  for (const product of getResults(products, { ...query, categories: [] }, categoryNames)) {
    counts[product.category] = (counts[product.category] ?? 0) + 1;
  }
  return counts;
}

// ===== Sorting =====
// Compare functions for sort(): negative puts `a` first, positive puts `b`
// first. Every one ends with a tie-breaker on id, so products with the same
// price (or rating...) always come out in the same order. Without it, two
// $19.99 items could swap places between page loads, and a product could
// appear on both page 1 and page 2.
const byId = (a, b) => a.id - b.id;

const SORTS = {
  featured: byId, // the shop's own order
  "price-asc": (a, b) => finalPriceCents(a) - finalPriceCents(b) || byId(a, b),
  "price-desc": (a, b) => finalPriceCents(b) - finalPriceCents(a) || byId(a, b),
  // Highest rated first; with equal ratings, the one more people reviewed
  rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount || byId(a, b),
  // "2022-07-30" > "2022-01-05": dates written year-month-day sort as text
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt) || byId(a, b),
  popular: (a, b) => b.reviewCount - a.reviewCount || byId(a, b),
};

export const SORT_OPTIONS = Object.keys(SORTS);
export const DEFAULT_SORT = "featured";

// A NEW sorted array. sort() changes the array it's called on, so we sort
// a copy and never touch the list we were given.
export function sortProducts(products, sort) {
  const compare = SORTS[sort] ?? SORTS[DEFAULT_SORT];
  return [...products].sort(compare);
}

// ===== Pagination =====
// 12 fits neatly into rows of 2, 3, 4 or 6 cards
export const PAGE_SIZE = 12;

// One page of the results, plus what's needed to show "13–24 of 120".
// A page number that's too big or too small (e.g. page 9 after a filter
// left only 2 pages) is moved to the nearest real page.
export function paginate(items, page, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const startIndex = (current - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);

  return {
    items: pageItems,
    page: current,
    totalPages,
    total: items.length,
    // 1-based positions for people: "Showing 13–24"
    from: pageItems.length > 0 ? startIndex + 1 : 0,
    to: startIndex + pageItems.length,
  };
}

// Which page buttons to show. All of them if there are only a few;
// otherwise the first, the last, and the current page with its neighbours,
// with "…" for the gaps:
//   pageNumbers(1, 10) -> [1, 2, 3, 4, 5, "…", 10]
//   pageNumbers(5, 10) -> [1, "…", 4, 5, 6, "…", 10]
// It always returns the same number of items once there are more than 7
// pages, so the buttons don't jump around as you click through them.
export function pageNumbers(current, totalPages) {
  const MAX_BUTTONS = 7;
  if (totalPages <= MAX_BUTTONS) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  // Near the start or the end, show 5 in a row instead of 3
  if (current <= 4) return [1, 2, 3, 4, 5, "…", totalPages];
  if (current >= totalPages - 3) {
    return [1, "…", ...Array.from({ length: 5 }, (_, i) => totalPages - 4 + i)];
  }
  return [1, "…", current - 1, current, current + 1, "…", totalPages];
}

// ===== Cleaning what was typed =====
// Text from a price box -> whole dollars, or null for "no limit".
// "" -> null, "abc" -> null, "-5" -> null, "49.99" -> 49
export function parsePrice(text) {
  if (String(text).trim() === "") return null;
  const value = Math.floor(Number(text));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// Typed the wrong way round ("$100 to $20")? Swap them instead of
// showing nothing.
export function orderPriceRange(minPrice, maxPrice) {
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    return { minPrice: maxPrice, maxPrice: minPrice };
  }
  return { minPrice, maxPrice };
}
