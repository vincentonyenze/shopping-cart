// The query <-> the URL's query string.
//
//   { search: "wireless", categories: ["electronics"], maxPrice: 100,
//     sort: "price-asc", page: 2, ... }
//   <->  ?q=wireless&category=electronics&max=100&sort=price-asc&page=2
//
// Only what differs from a fresh visit goes in, so the URL stays short and
// readable. Pure functions, tested in tests/url.test.js.
import { parsePrice, orderPriceRange, SORT_OPTIONS, DEFAULT_SORT } from "./catalog.js";

// The rating filter only offers these (the radio buttons in index.html)
const RATINGS = [0, 3, 4];

// query -> "q=wireless&category=electronics,shoes&max=100"
// (without the "?"; URLSearchParams encodes spaces and symbols for us)
export function queryToSearchParams(query) {
  const params = new URLSearchParams();
  if (query.search) params.set("q", query.search);
  if (query.categories.length > 0) params.set("category", query.categories.join(","));
  if (query.minPrice !== null) params.set("min", query.minPrice);
  if (query.maxPrice !== null) params.set("max", query.maxPrice);
  if (query.minRating > 0) params.set("rating", query.minRating);
  if (query.inStock) params.set("stock", "1");
  if (query.onSale) params.set("sale", "1");
  if (query.sort !== DEFAULT_SORT) params.set("sort", query.sort);
  if (query.page > 1) params.set("page", query.page);
  return params.toString();
}

// "?q=wireless&page=2" -> a full query.
// Anyone can type or edit a URL, so NOTHING is trusted: every value is
// checked, and anything odd falls back to "not set" instead of breaking
// the page. validCategories: the category slugs that actually exist.
export function searchParamsToQuery(search, validCategories) {
  const params = new URLSearchParams(search);

  const categories = (params.get("category") ?? "")
    .split(",")
    .filter((slug) => validCategories.includes(slug));
  // No repeats, and in the shop's order whatever order the URL used
  const orderedCategories = validCategories.filter((slug) => categories.includes(slug));

  const { minPrice, maxPrice } = orderPriceRange(
    parsePrice(params.get("min") ?? ""),
    parsePrice(params.get("max") ?? "")
  );

  const rating = Number(params.get("rating"));
  const sort = params.get("sort");
  const page = Number.parseInt(params.get("page"), 10);

  return {
    search: (params.get("q") ?? "").trim(),
    categories: orderedCategories,
    minPrice,
    maxPrice,
    minRating: RATINGS.includes(rating) ? rating : 0,
    inStock: params.get("stock") === "1",
    onSale: params.get("sale") === "1",
    sort: SORT_OPTIONS.includes(sort) ? sort : DEFAULT_SORT,
    page: page >= 1 ? page : 1,
  };
}
