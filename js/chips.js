// The "active filter" chips above the products: one for each thing you've
// narrowed the results by, each with an ✕ to remove just that one.
//
//   [“wireless” ✕] [Electronics ✕] [$20 – $100 ✕] [4★ & up ✕] [In stock ✕]
//
// Pure: a query in, a list of chips out. Each chip carries `remove`, the
// changes to make to the query to undo it. Tested in tests/chips.test.js.

function priceLabel(minPrice, maxPrice) {
  if (minPrice !== null && maxPrice !== null) return `$${minPrice} – $${maxPrice}`;
  if (minPrice !== null) return `$${minPrice} and up`;
  return `Up to $${maxPrice}`;
}

// categoryNames: { shoes: "Shoes", ... }
export function activeFilterChips(query, categoryNames = {}) {
  const chips = [];

  if (query.search) {
    chips.push({ id: "search", label: `“${query.search}”`, remove: { search: "" } });
  }

  for (const slug of query.categories) {
    chips.push({
      id: `category:${slug}`,
      label: categoryNames[slug] ?? slug,
      remove: { categories: query.categories.filter((other) => other !== slug) },
    });
  }

  if (query.minPrice !== null || query.maxPrice !== null) {
    chips.push({
      id: "price",
      label: priceLabel(query.minPrice, query.maxPrice),
      remove: { minPrice: null, maxPrice: null },
    });
  }

  if (query.minRating > 0) {
    chips.push({ id: "rating", label: `${query.minRating}★ & up`, remove: { minRating: 0 } });
  }

  if (query.inStock) {
    chips.push({ id: "inStock", label: "In stock", remove: { inStock: false } });
  }

  if (query.onSale) {
    chips.push({ id: "onSale", label: "On sale", remove: { onSale: false } });
  }

  return chips;
}
