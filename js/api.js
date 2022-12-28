// Loading the catalog. It's a local file today, but the rest of the app
// doesn't know that: swap the URL for a real server (Level 4) and nothing
// else has to change.

const CATALOG_URL = "data/products.json";

export class CatalogError extends Error {
  name = "CatalogError";
}

function isValidProduct(product) {
  return (
    Boolean(product) &&
    Number.isInteger(product.id) &&
    typeof product.name === "string" &&
    typeof product.category === "string" &&
    Number.isInteger(product.priceCents) &&
    Number.isFinite(product.rating)
  );
}

// -> { categories: [{ slug, name }], products: [...] }
export async function loadCatalog() {
  let response;
  try {
    response = await fetch(CATALOG_URL);
  } catch {
    throw new CatalogError("Couldn't load the products. Check your connection and try again.");
  }

  // fetch only throws when there's no answer; a 404 still "succeeds"
  if (!response.ok) {
    throw new CatalogError(`Couldn't load the products (error ${response.status}).`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new CatalogError("The product data is damaged.");
  }

  if (!Array.isArray(data?.products) || !Array.isArray(data?.categories)) {
    throw new CatalogError("The product data is damaged.");
  }

  // Keep every good product, even if a few are broken
  return {
    categories: data.categories,
    products: data.products.filter(isValidProduct),
  };
}
