import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { queryToSearchParams, searchParamsToQuery } from "../js/url.js";

const CATEGORIES = ["electronics", "clothing", "shoes", "books"];

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

describe("queryToSearchParams", () => {
  test("is empty for a fresh visit", () => {
    assert.equal(queryToSearchParams(EMPTY), "");
  });

  test("only includes what's been chosen", () => {
    assert.equal(queryToSearchParams({ ...EMPTY, maxPrice: 100, page: 2 }), "max=100&page=2");
  });

  test("joins several categories with commas", () => {
    // URLSearchParams writes "," as %2C, which is the safe way to send it
    assert.equal(
      queryToSearchParams({ ...EMPTY, categories: ["shoes", "clothing"] }),
      "category=shoes%2Cclothing"
    );
  });

  test("encodes spaces and symbols in the search", () => {
    assert.equal(queryToSearchParams({ ...EMPTY, search: "café & tea" }), "q=caf%C3%A9+%26+tea");
  });

  test("includes every kind of filter", () => {
    const query = {
      search: "wireless",
      categories: ["electronics"],
      minPrice: 20,
      maxPrice: 100,
      minRating: 4,
      inStock: true,
      onSale: true,
      sort: "price-asc",
      page: 3,
    };
    assert.equal(
      queryToSearchParams(query),
      "q=wireless&category=electronics&min=20&max=100&rating=4&stock=1&sale=1&sort=price-asc&page=3"
    );
  });
});

describe("searchParamsToQuery", () => {
  test("gives a fresh query for an empty URL", () => {
    assert.deepEqual(searchParamsToQuery("", CATEGORIES), EMPTY);
  });

  test("reads every kind of filter", () => {
    const query = searchParamsToQuery(
      "?q=wireless&category=electronics&min=20&max=100&rating=4&stock=1&sale=1&sort=price-asc&page=3",
      CATEGORIES
    );
    assert.deepEqual(query, {
      search: "wireless",
      categories: ["electronics"],
      minPrice: 20,
      maxPrice: 100,
      minRating: 4,
      inStock: true,
      onSale: true,
      sort: "price-asc",
      page: 3,
    });
  });

  test("drops categories that don't exist", () => {
    assert.deepEqual(searchParamsToQuery("?category=shoes,spaceships", CATEGORIES).categories, ["shoes"]);
  });

  test("puts categories in the shop's order, without repeats", () => {
    assert.deepEqual(
      searchParamsToQuery("?category=shoes,electronics,shoes", CATEGORIES).categories,
      ["electronics", "shoes"]
    );
  });

  test("ignores a sort it doesn't know", () => {
    assert.equal(searchParamsToQuery("?sort=random", CATEGORIES).sort, "featured");
  });

  test("ignores a rating the page doesn't offer", () => {
    assert.equal(searchParamsToQuery("?rating=5", CATEGORIES).minRating, 0);
  });

  test("ignores bad page numbers", () => {
    for (const page of ["0", "-3", "abc", ""]) {
      assert.equal(searchParamsToQuery(`?page=${page}`, CATEGORIES).page, 1, `page=${page}`);
    }
  });

  test("ignores bad prices, and swaps a backwards range", () => {
    assert.equal(searchParamsToQuery("?min=cheap", CATEGORIES).minPrice, null);
    const query = searchParamsToQuery("?min=100&max=20", CATEGORIES);
    assert.equal(query.minPrice, 20);
    assert.equal(query.maxPrice, 100);
  });

  test("only treats stock=1 as yes", () => {
    assert.equal(searchParamsToQuery("?stock=yes", CATEGORIES).inStock, false);
  });
});

describe("round trip", () => {
  test("query -> URL -> query gives back the same query", () => {
    const query = {
      ...EMPTY,
      search: "summer dress",
      categories: ["clothing", "shoes"],
      minPrice: 10,
      onSale: true,
      sort: "newest",
      page: 2,
    };
    assert.deepEqual(searchParamsToQuery(queryToSearchParams(query), CATEGORIES), query);
  });
});
