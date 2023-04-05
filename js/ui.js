// Everything that draws on the page. These functions take data and update
// the DOM; they never filter, sort or fetch anything themselves.
import { formatPrice, finalPriceCents, starText, formatCount, stockLabel } from "./format.js";

export const elements = {
  searchForm: document.getElementById("search-form"),
  searchInput: document.getElementById("search-input"),
  filters: document.getElementById("filters"),
  filtersForm: document.getElementById("filters-form"),
  categoryList: document.getElementById("category-list"),
  priceMin: document.getElementById("price-min"),
  priceMax: document.getElementById("price-max"),
  clearFilters: document.getElementById("clear-filters"),
  resultsTitle: document.getElementById("results-title"),
  resultsCount: document.getElementById("results-count"),
  sortSelect: document.getElementById("sort-select"),
  activeFilters: document.getElementById("active-filters"),
  filtersToggleCount: document.getElementById("filters-toggle-count"),
  filtersToggle: document.getElementById("filters-toggle"),
  filtersClose: document.getElementById("filters-close"),
  filtersDone: document.getElementById("filters-done"),
  siteHeader: document.querySelector(".site-header"),
  results: document.querySelector(".results"),
  status: document.getElementById("status"),
  statusIcon: document.getElementById("status-icon"),
  statusMessage: document.getElementById("status-message"),
  statusAction: document.getElementById("status-action"),
  grid: document.getElementById("product-grid"),
  pagination: document.getElementById("pagination"),
  cardTemplate: document.getElementById("product-card-template"),
};

// ===== Product cards =====
// About the first row on a wide screen: these photos load straight away,
// the rest only as they're scrolled near (loading="lazy")
const EAGER_PHOTOS = 4;

// categoryNames: { electronics: "Electronics", ... } for the small label
// index: the card's position on the page
function createProductCard(product, categoryNames, index) {
  const fragment = elements.cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".product-card");
  const $ = (selector) => card.querySelector(selector);
  // So a click on its "Add to cart" button knows which product it's for
  card.dataset.productId = product.id;

  // alt describes the photo for people who can't see it. The name is
  // the best description we have of a product shot.
  const photo = $(".product-card__photo");
  photo.alt = product.name;
  photo.loading = index < EAGER_PHOTOS ? "eager" : "lazy";
  photo.decoding = "async";
  photo.addEventListener("error", () => {
    $(".product-card__image").classList.add("product-card__image--missing");
  }, { once: true });
  photo.src = product.image;

  $(".product-card__category").textContent = categoryNames[product.category] ?? product.category;
  $(".product-card__name").textContent = product.name;
  // Some products (e.g. groceries) have no brand
  const brand = $(".product-card__brand");
  brand.textContent = product.brand;
  brand.hidden = !product.brand;

  // On screen: ★★★★☆ 4.4 (196). Screen readers get a sentence instead.
  $(".stars").textContent = starText(product.rating);
  const ratingText = $(".product-card__rating-text");
  ratingText.textContent = `${product.rating.toFixed(1)} (${formatCount(product.reviewCount)})`;
  ratingText.setAttribute("aria-hidden", "true");
  const spoken = document.createElement("span");
  spoken.className = "visually-hidden";
  spoken.textContent =
    `Rated ${product.rating.toFixed(1)} out of 5 from ${formatCount(product.reviewCount)} reviews`;
  ratingText.after(spoken);

  // Price: the sale price, with the old one crossed out
  $(".product-card__price-now").textContent = formatPrice(finalPriceCents(product));
  const badge = $(".product-card__badge");
  if (product.discountPercent > 0) {
    card.classList.add("product-card--sale");
    const was = $(".product-card__price-was");
    was.hidden = false;
    was.textContent = formatPrice(product.priceCents);
    badge.hidden = false;
    badge.textContent = `−${product.discountPercent}%`;
  }

  // Stock. "Sold out" wins over a sale badge: you can't buy it anyway.
  const stock = stockLabel(product.stock);
  $(".product-card__stock").textContent = stock.text;
  if (stock.level === "none") {
    card.classList.add("product-card--sold-out");
    badge.hidden = false;
    badge.textContent = "Sold out";
    badge.classList.add("product-card__badge--muted");
  }

  return fragment;
}

export function renderProducts(products, categoryNames) {
  elements.grid.replaceChildren(
    ...products.map((product, index) => createProductCard(product, categoryNames, index))
  );
  elements.grid.hidden = products.length === 0;
}

// "120 products", or "Showing 13–24 of 120 products" when there are pages
export function renderCount({ total, from, to, totalPages }) {
  const products = `${formatCount(total)} product${total === 1 ? "" : "s"}`;
  elements.resultsCount.textContent =
    totalPages > 1 ? `Showing ${from}–${to} of ${products}` : products;
}

// ===== Active filter chips =====
// chips: from activeFilterChips(). With two or more, a "Clear all" link
// is added at the end. The ⚙️ Filters button (on phones) shows how many.
export function renderActiveFilters(chips) {
  const items = chips.map((chip) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.chipId = chip.id;
    // Visible: "Shoes ✕". Heard: "Remove filter: Shoes"
    button.setAttribute("aria-label", `Remove filter: ${chip.label}`);
    button.textContent = chip.label;
    const cross = document.createElement("span");
    cross.setAttribute("aria-hidden", "true");
    cross.textContent = "✕";
    button.append(cross);

    const item = document.createElement("li");
    item.append(button);
    return item;
  });

  if (chips.length >= 2) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "chip chip--clear";
    clear.dataset.chipId = "clear-all";
    clear.textContent = "Clear all";
    const item = document.createElement("li");
    item.append(clear);
    items.push(item);
  }

  elements.activeFilters.replaceChildren(...items);
  elements.activeFilters.hidden = chips.length === 0;

  elements.filtersToggleCount.textContent = chips.length;
  elements.filtersToggleCount.hidden = chips.length === 0;
}

// After a chip is removed, its button is gone. Put focus on the chip that
// took its place (or the one before it), or the heading if none are left.
export function focusChipAt(index) {
  const chips = elements.activeFilters.querySelectorAll(".chip");
  const chip = chips[Math.min(index, chips.length - 1)];
  (chip ?? elements.resultsTitle).focus();
}

// ===== Filter drawer (phones and small tablets) =====
// While open it behaves like a dialog: the rest of the page is made
// `inert` (can't be clicked, tabbed to or read by screen readers), so
// keyboard users can't wander off behind it.
export function setFiltersOpen(isOpen) {
  elements.filters.classList.toggle("filters--open", isOpen);
  elements.filtersToggle.setAttribute("aria-expanded", String(isOpen));
  elements.siteHeader.inert = isOpen;
  elements.results.inert = isOpen;
  document.body.classList.toggle("no-scroll", isOpen);

  // Only a dialog while it's open on a small screen
  if (isOpen) {
    elements.filters.setAttribute("role", "dialog");
    elements.filters.setAttribute("aria-modal", "true");
  } else {
    elements.filters.removeAttribute("role");
    elements.filters.removeAttribute("aria-modal");
  }
}

// "Show 24 results" on the drawer's button, so you know what you'll get
// before you close it
export function renderShowResults(total) {
  elements.filtersDone.textContent =
    total === 0 ? "No results" : `Show ${formatCount(total)} result${total === 1 ? "" : "s"}`;
}

// ===== Pagination =====
function createPageButton(label, page, { current = false, disabled = false, ariaLabel } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "page-btn";
  button.textContent = label;
  button.dataset.page = page;
  button.disabled = disabled;
  if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
  // aria-current="page" tells screen readers "you are here"
  if (current) button.setAttribute("aria-current", "page");
  return button;
}

// ‹ 1 … 4 5 6 … 10 ›  (pages: the list from pageNumbers())
export function renderPagination(current, totalPages, pages) {
  elements.pagination.hidden = totalPages <= 1;
  if (totalPages <= 1) {
    elements.pagination.replaceChildren();
    return;
  }

  const buttons = pages.map((page) => {
    if (page === "…") {
      const gap = document.createElement("span");
      gap.className = "page-gap";
      gap.textContent = "…";
      gap.setAttribute("aria-hidden", "true");
      return gap;
    }
    return createPageButton(page, page, { current: page === current, ariaLabel: `Page ${page}` });
  });

  elements.pagination.replaceChildren(
    createPageButton("‹", current - 1, { disabled: current === 1, ariaLabel: "Previous page" }),
    ...buttons,
    createPageButton("›", current + 1, { disabled: current === totalPages, ariaLabel: "Next page" })
  );
}

// ===== Category checkboxes =====
// Built once, when the data arrives:
// <label class="option"><input type="checkbox" value="shoes"> Shoes <span>(15)</span></label>
export function renderCategoryOptions(categories) {
  elements.categoryList.replaceChildren(
    ...categories.map(({ slug, name }) => {
      const label = document.createElement("label");
      label.className = "option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "category";
      checkbox.value = slug;

      const text = document.createElement("span");
      text.textContent = name;

      const count = document.createElement("span");
      count.className = "option__count";

      label.append(checkbox, text, count);
      return label;
    })
  );
}

// After every change: tick the chosen ones and update the counts. The
// checkboxes are updated, never rebuilt. Rebuilding would throw away the
// one you just clicked, and with it your keyboard focus.
export function updateCategoryOptions(counts, selected) {
  for (const checkbox of elements.categoryList.querySelectorAll("input")) {
    const count = counts[checkbox.value] ?? 0;
    checkbox.checked = selected.includes(checkbox.value);
    const label = checkbox.closest(".option");
    label.querySelector(".option__count").textContent = count;
    // Greyed out (but still clickable) when it would show nothing
    label.classList.toggle("option--empty", count === 0 && !checkbox.checked);
  }
}

// ===== The whole filter form =====
// Read every filter at once. FormData collects the form's values by
// their name="" attributes, the same way a form would send them to a server.
// The price boxes come back as raw text; catalog.js cleans them up.
export function readFilters() {
  const form = new FormData(elements.filtersForm);
  return {
    categories: form.getAll("category"), // every ticked box with name="category"
    minPriceText: form.get("min"),
    maxPriceText: form.get("max"),
    minRating: Number(form.get("rating") ?? 0),
    inStock: form.has("inStock"), // an unticked checkbox isn't sent at all
    onSale: form.has("onSale"),
  };
}

// The other direction: make the form show a query (after Clear all, and
// in Step 10 when the page opens from a link)
export function writeFilters(query) {
  // The category ticks are set by updateCategoryOptions on every render
  elements.priceMin.value = query.minPrice ?? "";
  elements.priceMax.value = query.maxPrice ?? "";
  const ratingRadio = elements.filtersForm.querySelector(`input[name="rating"][value="${query.minRating}"]`);
  if (ratingRadio) ratingRadio.checked = true;
  elements.filtersForm.elements.inStock.checked = query.inStock;
  elements.filtersForm.elements.onSale.checked = query.onSale;
}

// ===== Status: loading, error, nothing found =====
// action: { label, onClick } for a button such as "Try again", or null
let statusActionHandler = null;

export function showStatus({ icon, message, action = null }) {
  elements.statusIcon.textContent = icon;
  elements.statusMessage.textContent = message;
  elements.statusAction.hidden = !action;
  if (action) elements.statusAction.textContent = action.label;
  statusActionHandler = action?.onClick ?? null;
  elements.status.hidden = false;
}

export function hideStatus() {
  elements.status.hidden = true;
}

elements.statusAction.addEventListener("click", () => statusActionHandler?.());
