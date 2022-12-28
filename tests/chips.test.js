import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { activeFilterChips } from "../js/chips.js";

const EMPTY = {
  search: "",
  categories: [],
  minPrice: null,
  maxPrice: null,
  minRating: 0,
  inStock: false,
  onSale: false,
  sort: "featured",
  page: 1,
};

const names = { shoes: "Shoes", clothing: "Clothing" };
const labels = (query) => activeFilterChips(query, names).map((chip) => chip.label);

describe("activeFilterChips", () => {
  test("has no chips when nothing is chosen", () => {
    assert.deepEqual(activeFilterChips(EMPTY, names), []);
  });

  test("doesn't make a chip for the sort or the page", () => {
    assert.deepEqual(activeFilterChips({ ...EMPTY, sort: "newest", page: 3 }, names), []);
  });

  test("shows the search in quotes", () => {
    assert.deepEqual(labels({ ...EMPTY, search: "lamp" }), ["“lamp”"]);
  });

  test("makes one chip per category, using its name", () => {
    assert.deepEqual(labels({ ...EMPTY, categories: ["shoes", "clothing"] }), ["Shoes", "Clothing"]);
  });

  test("describes each kind of price range", () => {
    assert.deepEqual(labels({ ...EMPTY, minPrice: 20, maxPrice: 100 }), ["$20 – $100"]);
    assert.deepEqual(labels({ ...EMPTY, minPrice: 20 }), ["$20 and up"]);
    assert.deepEqual(labels({ ...EMPTY, maxPrice: 50 }), ["Up to $50"]);
  });

  test("includes $0 as a real price", () => {
    assert.deepEqual(labels({ ...EMPTY, minPrice: 0, maxPrice: 10 }), ["$0 – $10"]);
  });

  test("shows rating, stock and sale", () => {
    assert.deepEqual(labels({ ...EMPTY, minRating: 4, inStock: true, onSale: true }), [
      "4★ & up",
      "In stock",
      "On sale",
    ]);
  });

  test("removing a category chip keeps the other categories", () => {
    const [shoesChip] = activeFilterChips({ ...EMPTY, categories: ["shoes", "clothing"] }, names);
    assert.deepEqual(shoesChip.remove, { categories: ["clothing"] });
  });

  test("removing the price chip clears both ends", () => {
    const [chip] = activeFilterChips({ ...EMPTY, minPrice: 20, maxPrice: 100 }, names);
    assert.deepEqual(chip.remove, { minPrice: null, maxPrice: null });
  });

  test("every chip has a different id", () => {
    const query = {
      ...EMPTY,
      search: "x",
      categories: ["shoes", "clothing"],
      maxPrice: 5,
      minRating: 3,
      inStock: true,
      onSale: true,
    };
    const ids = activeFilterChips(query, names).map((chip) => chip.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});
