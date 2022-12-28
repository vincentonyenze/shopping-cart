import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  simplify,
  matchesSearch,
  matchesCategories,
  matchesPrice,
  matchesRating,
  matchesAvailability,
  getResults,
  countByCategory,
  parsePrice,
  orderPriceRange,
  sortProducts,
  paginate,
  pageNumbers,
} from "../js/catalog.js";

// A query with nothing chosen; tests change only what they need
const ANY = {
  search: "",
  categories: [],
  minPrice: null,
  maxPrice: null,
  minRating: 0,
  inStock: false,
  onSale: false,
};

// A small, hand-made catalog: easy to reason about in every test
const product = (id, overrides = {}) => ({
  id,
  name: `Product ${id}`,
  brand: "Brand",
  category: "home",
  priceCents: 1000,
  discountPercent: 0,
  rating: 4,
  reviewCount: 10,
  stock: 10,
  tags: [],
  createdAt: "2022-01-01",
  ...overrides,
});

const headphones = product(1, {
  name: "Pro Wireless Headphones",
  brand: "Voltix",
  category: "electronics",
  tags: ["audio", "wireless", "bluetooth"],
});
const perfume = product(2, { name: "Radiant Perfume", brand: "Lumière", category: "beauty", tags: ["fragrance"] });
const mouse = product(3, { name: "Wireless Mouse", brand: "Pixelon", category: "electronics", tags: ["computer"] });

const categoryNames = { electronics: "Electronics", beauty: "Beauty" };

describe("simplify", () => {
  test("makes text lower case", () => {
    assert.equal(simplify("HeadPHONES"), "headphones");
  });

  test("removes accents", () => {
    assert.equal(simplify("Lumière Crème"), "lumiere creme");
  });
});

describe("matchesSearch", () => {
  test("matches everything when there's no search", () => {
    assert.equal(matchesSearch(headphones, ""), true);
    assert.equal(matchesSearch(headphones, "   "), true);
  });

  test("matches the name, ignoring case", () => {
    assert.equal(matchesSearch(headphones, "HEADPHONES"), true);
  });

  test("matches part of a word", () => {
    assert.equal(matchesSearch(headphones, "head"), true);
  });

  test("matches the brand", () => {
    assert.equal(matchesSearch(headphones, "voltix"), true);
  });

  test("matches a tag", () => {
    assert.equal(matchesSearch(headphones, "bluetooth"), true);
  });

  test("matches the category's name", () => {
    assert.equal(matchesSearch(headphones, "electronics", categoryNames), true);
  });

  test("matches without typing the accent", () => {
    assert.equal(matchesSearch(perfume, "lumiere"), true);
  });

  test("needs every word to match, in any order", () => {
    assert.equal(matchesSearch(headphones, "audio wireless"), true);
    assert.equal(matchesSearch(mouse, "audio wireless"), false);
  });

  test("doesn't match unrelated words", () => {
    assert.equal(matchesSearch(headphones, "perfume"), false);
  });
});

describe("getResults", () => {
  const products = [headphones, perfume, mouse];

  test("returns everything with no search", () => {
    assert.equal(getResults(products, { ...ANY, search: "", categories: [] }).length, 3);
  });

  test("returns only the matches", () => {
    assert.deepEqual(
      getResults(products, { ...ANY, search: "wireless", categories: [] }).map((p) => p.id),
      [1, 3]
    );
  });

  test("doesn't change the list it was given", () => {
    const copy = [...products];
    getResults(products, { ...ANY, search: "wireless", categories: [] });
    assert.deepEqual(products, copy);
  });
});

describe("matchesCategories", () => {
  test("matches everything when no category is ticked", () => {
    assert.equal(matchesCategories(perfume, []), true);
  });

  test("matches a ticked category", () => {
    assert.equal(matchesCategories(perfume, ["beauty"]), true);
  });

  test("matches any of several ticked categories", () => {
    assert.equal(matchesCategories(perfume, ["electronics", "beauty"]), true);
  });

  test("doesn't match other categories", () => {
    assert.equal(matchesCategories(perfume, ["electronics"]), false);
  });
});

describe("getResults with search and categories", () => {
  const products = [headphones, perfume, mouse];

  test("needs a product to pass both", () => {
    // "wireless" matches headphones and mouse; only they're electronics
    const results = getResults(products, { ...ANY, search: "wireless", categories: ["beauty"] });
    assert.deepEqual(results, []);
  });

  test("combines them", () => {
    const results = getResults(products, { ...ANY, search: "pro", categories: ["electronics"] });
    assert.deepEqual(results.map((p) => p.id), [1]);
  });
});

describe("countByCategory", () => {
  const products = [headphones, perfume, mouse];

  test("counts the products in each category", () => {
    assert.deepEqual(countByCategory(products, { ...ANY, search: "", categories: [] }), {
      electronics: 2,
      beauty: 1,
    });
  });

  test("follows the search", () => {
    assert.deepEqual(countByCategory(products, { ...ANY, search: "mouse", categories: [] }), {
      electronics: 1,
    });
  });

  test("ignores the ticked categories, so the others still show their counts", () => {
    assert.deepEqual(countByCategory(products, { ...ANY, search: "", categories: ["beauty"] }), {
      electronics: 2,
      beauty: 1,
    });
  });
});

describe("matchesPrice", () => {
  const item = product(10, { priceCents: 5000 }); // $50.00

  test("has no limits when both are null", () => {
    assert.equal(matchesPrice(item, null, null), true);
  });

  test("includes prices exactly on the limits", () => {
    assert.equal(matchesPrice(item, 50, 50), true);
  });

  test("leaves out prices below the minimum", () => {
    assert.equal(matchesPrice(item, 51, null), false);
  });

  test("leaves out prices above the maximum", () => {
    assert.equal(matchesPrice(item, null, 49), false);
  });

  test("uses the price after the discount", () => {
    // $50 with 20% off is $40: under a $45 maximum
    const onSale = product(11, { priceCents: 5000, discountPercent: 20 });
    assert.equal(matchesPrice(onSale, null, 45), true);
  });
});

describe("matchesRating", () => {
  test("includes ratings at or above the minimum", () => {
    assert.equal(matchesRating(product(1, { rating: 4 }), 4), true);
    assert.equal(matchesRating(product(1, { rating: 4.7 }), 4), true);
  });

  test("leaves out lower ratings", () => {
    assert.equal(matchesRating(product(1, { rating: 3.9 }), 4), false);
  });
});

describe("matchesAvailability", () => {
  const soldOut = product(1, { stock: 0 });
  const onSale = product(2, { discountPercent: 15 });

  test("shows everything when neither box is ticked", () => {
    assert.equal(matchesAvailability(soldOut, { inStock: false, onSale: false }), true);
  });

  test("in stock only leaves out sold-out products", () => {
    assert.equal(matchesAvailability(soldOut, { inStock: true, onSale: false }), false);
  });

  test("on sale only leaves out full-price products", () => {
    assert.equal(matchesAvailability(soldOut, { inStock: false, onSale: true }), false);
    assert.equal(matchesAvailability(onSale, { inStock: false, onSale: true }), true);
  });
});

describe("getResults with every filter", () => {
  const cheapGood = product(1, { priceCents: 1500, rating: 4.5, category: "books" });
  const cheapBad = product(2, { priceCents: 1500, rating: 2.5, category: "books" });
  const pricey = product(3, { priceCents: 90000, rating: 4.8, category: "electronics" });
  const soldOut = product(4, { priceCents: 1500, rating: 4.9, stock: 0, category: "books" });
  const products = [cheapGood, cheapBad, pricey, soldOut];

  test("returns everything when nothing is chosen", () => {
    assert.equal(getResults(products, ANY).length, 4);
  });

  test("needs a product to pass every filter at once", () => {
    const query = { ...ANY, maxPrice: 50, minRating: 4, inStock: true };
    assert.deepEqual(getResults(products, query).map((p) => p.id), [1]);
  });

  test("category counts follow the other filters", () => {
    const query = { ...ANY, maxPrice: 50 };
    assert.deepEqual(countByCategory(products, query), { books: 3 });
  });
});

describe("parsePrice", () => {
  test("is null for an empty box", () => {
    assert.equal(parsePrice(""), null);
    assert.equal(parsePrice("   "), null);
  });

  test("reads whole dollars", () => {
    assert.equal(parsePrice("49"), 49);
  });

  test("drops cents", () => {
    assert.equal(parsePrice("49.99"), 49);
  });

  test("is null for anything that isn't a price", () => {
    assert.equal(parsePrice("abc"), null);
    assert.equal(parsePrice("-5"), null);
  });

  test("allows 0", () => {
    assert.equal(parsePrice("0"), 0);
  });
});

describe("orderPriceRange", () => {
  test("swaps a range typed the wrong way round", () => {
    assert.deepEqual(orderPriceRange(100, 20), { minPrice: 20, maxPrice: 100 });
  });

  test("leaves a correct range alone", () => {
    assert.deepEqual(orderPriceRange(20, 100), { minPrice: 20, maxPrice: 100 });
  });

  test("leaves a range with one side empty alone", () => {
    assert.deepEqual(orderPriceRange(100, null), { minPrice: 100, maxPrice: null });
  });
});

describe("sortProducts", () => {
  const a = product(1, { priceCents: 3000, rating: 4.2, reviewCount: 50, createdAt: "2022-03-01" });
  const b = product(2, { priceCents: 1000, rating: 4.8, reviewCount: 900, createdAt: "2021-11-20" });
  // $40 with 50% off = $20: between a and b when sorting by price
  const c = product(3, { priceCents: 4000, discountPercent: 50, rating: 4.8, reviewCount: 10, createdAt: "2022-07-15" });
  const products = [c, a, b];
  const ids = (list) => list.map((p) => p.id);

  test("featured keeps the shop's own order (by id)", () => {
    assert.deepEqual(ids(sortProducts(products, "featured")), [1, 2, 3]);
  });

  test("price low to high uses the price after discounts", () => {
    assert.deepEqual(ids(sortProducts(products, "price-asc")), [2, 3, 1]);
  });

  test("price high to low", () => {
    assert.deepEqual(ids(sortProducts(products, "price-desc")), [1, 3, 2]);
  });

  test("rating: highest first, then the most reviewed", () => {
    // b and c are both 4.8; b has more reviews
    assert.deepEqual(ids(sortProducts(products, "rating")), [2, 3, 1]);
  });

  test("newest first", () => {
    assert.deepEqual(ids(sortProducts(products, "newest")), [3, 1, 2]);
  });

  test("most reviewed first", () => {
    assert.deepEqual(ids(sortProducts(products, "popular")), [2, 1, 3]);
  });

  test("breaks ties by id, so the order never changes", () => {
    const same = [product(9, { priceCents: 500 }), product(4, { priceCents: 500 }), product(7, { priceCents: 500 })];
    assert.deepEqual(ids(sortProducts(same, "price-asc")), [4, 7, 9]);
  });

  test("falls back to featured for a sort it doesn't know", () => {
    assert.deepEqual(ids(sortProducts(products, "cheapest-ever")), [1, 2, 3]);
  });

  test("doesn't change the list it was given", () => {
    sortProducts(products, "price-asc");
    assert.deepEqual(ids(products), [3, 1, 2]);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 30 }, (_, i) => i + 1); // 1..30

  test("gives the first page", () => {
    const page = paginate(items, 1, 12);
    assert.deepEqual(page.items, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.equal(page.totalPages, 3);
    assert.equal(page.from, 1);
    assert.equal(page.to, 12);
  });

  test("gives a middle page", () => {
    const page = paginate(items, 2, 12);
    assert.equal(page.items[0], 13);
    assert.equal(page.from, 13);
    assert.equal(page.to, 24);
  });

  test("the last page can be shorter", () => {
    const page = paginate(items, 3, 12);
    assert.deepEqual(page.items, [25, 26, 27, 28, 29, 30]);
    assert.equal(page.to, 30);
  });

  test("moves a page number that's too big to the last page", () => {
    assert.equal(paginate(items, 9, 12).page, 3);
  });

  test("moves a page number that's too small, or not a number, to page 1", () => {
    assert.equal(paginate(items, 0, 12).page, 1);
    assert.equal(paginate(items, -4, 12).page, 1);
    assert.equal(paginate(items, NaN, 12).page, 1);
  });

  test("an empty list still has 1 page, showing 0–0", () => {
    const page = paginate([], 1, 12);
    assert.equal(page.totalPages, 1);
    assert.deepEqual(page.items, []);
    assert.equal(page.from, 0);
    assert.equal(page.to, 0);
  });

  test("an exact multiple doesn't make an empty extra page", () => {
    assert.equal(paginate(items.slice(0, 24), 1, 12).totalPages, 2);
  });
});

describe("pageNumbers", () => {
  test("shows every page when there are 7 or fewer", () => {
    assert.deepEqual(pageNumbers(1, 1), [1]);
    assert.deepEqual(pageNumbers(3, 7), [1, 2, 3, 4, 5, 6, 7]);
  });

  test("near the start", () => {
    assert.deepEqual(pageNumbers(1, 10), [1, 2, 3, 4, 5, "…", 10]);
    assert.deepEqual(pageNumbers(4, 10), [1, 2, 3, 4, 5, "…", 10]);
  });

  test("in the middle", () => {
    assert.deepEqual(pageNumbers(5, 10), [1, "…", 4, 5, 6, "…", 10]);
  });

  test("near the end", () => {
    assert.deepEqual(pageNumbers(10, 10), [1, "…", 6, 7, 8, 9, 10]);
    assert.deepEqual(pageNumbers(7, 10), [1, "…", 6, 7, 8, 9, 10]);
  });

  test("always includes the current page, the first and the last", () => {
    for (let current = 1; current <= 20; current++) {
      const pages = pageNumbers(current, 20);
      assert.ok(pages.includes(current), `page ${current} is missing: ${pages}`);
      assert.equal(pages[0], 1);
      assert.equal(pages.at(-1), 20);
    }
  });

  test("always shows 7 items once there are more than 7 pages", () => {
    for (let current = 1; current <= 20; current++) {
      assert.equal(pageNumbers(current, 20).length, 7);
    }
  });
});
