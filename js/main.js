// Entry point: the only script loaded by index.html.
// It connects the data (api.js), the rules (catalog.js) and the page (ui.js).
import { loadCatalog } from "./api.js";
import {
  getResults,
  countByCategory,
  parsePrice,
  orderPriceRange,
  sortProducts,
  DEFAULT_SORT,
  paginate,
  pageNumbers,
} from "./catalog.js";
import { debounce } from "./utils.js";
import { queryToSearchParams, searchParamsToQuery } from "./url.js";
import { activeFilterChips } from "./chips.js";
import {
  elements,
  renderProducts,
  renderCount,
  showStatus,
  hideStatus,
  renderCategoryOptions,
  updateCategoryOptions,
  readFilters,
  writeFilters,
  renderPagination,
  renderActiveFilters,
  focusChipAt,
  setFiltersOpen,
  renderShowResults,
} from "./ui.js";

// Searching 120 products is instant, but waiting for a short pause means
// the grid doesn't flicker on every single letter
const SEARCH_DELAY_MS = 250;
// Wait a little longer for prices: "1", "12", "120" are all on the way to 120
const PRICE_DELAY_MS = 500;

// The same width as the CSS breakpoint where filters become a drawer
const drawerScreen = window.matchMedia("(max-width: 900px)");

// What a fresh visit shows: nothing searched, nothing filtered
// (catalog.js explains each field)
const EMPTY_QUERY = {
  search: "",
  categories: [],
  minPrice: null,
  maxPrice: null,
  minRating: 0,
  inStock: false,
  onSale: false,
  sort: DEFAULT_SORT,
  page: 1,
};

// Filled once the data arrives
let catalog = { categories: [], products: [] };
// { electronics: "Electronics", ... }, for looking names up quickly
let categoryNames = {};

// What the shopper has asked for. Every change goes: update the query,
// then commit() (which draws it). Any change other than the page itself goes back to
// page 1: page 4 of the old results means nothing for the new ones.
let query = EMPTY_QUERY;

// ===== Drawing =====
// "Results for “x”", the one chosen category's name, or "All products"
function resultsTitle() {
  if (query.search) return `Results for “${query.search}”`;
  if (query.categories.length === 1) return categoryNames[query.categories[0]];
  return "All products";
}

// Work out the results from scratch and draw them. Nothing about the
// results is stored: it's always calculated from `catalog` and `query`.
// history: "push" adds a Back-button step, "replace" just updates the URL
function render({ history: historyMode = "replace" } = {}) {
  // Filter first, then sort: sorting 20 matches is less work than 120.
  // Then cut out just the page being looked at.
  const results = sortProducts(getResults(catalog.products, query, categoryNames), query.sort);
  const page = paginate(results, query.page);
  // A page that doesn't exist (too big, or 0) was moved to a real one
  query = { ...query, page: page.page };

  elements.resultsTitle.textContent = resultsTitle();
  renderCount(page);
  renderProducts(page.items, categoryNames);
  renderPagination(page.page, page.totalPages, pageNumbers(page.page, page.totalPages));
  renderActiveFilters(activeFilterChips(query, categoryNames));
  renderShowResults(results.length);
  updateUrl(historyMode);
  updateCategoryOptions(countByCategory(catalog.products, query, categoryNames), query.categories);

  if (results.length === 0) {
    const message = query.search
      ? `No products match “${query.search}” with these filters.`
      : "No products match these filters.";
    showStatus({
      icon: "🔍",
      message,
      action: { label: "Clear all filters", onClick: clearAll },
    });
  } else {
    hideStatus();
  }
}

// ===== The URL and the Back button =====
// Keep the address bar in step with what's on screen, so a refresh or a
// copied link shows exactly the same thing. Neither call loads a new page:
// - pushState ADDS a step to the browser's history: Back returns to the
//   URL before it. Used when the shopper changes something.
// - replaceState swaps the CURRENT step's URL. Used for tidying up (e.g. a
//   page number that didn't exist), so Back doesn't land on a dead end.
function updateUrl(mode) {
  const params = queryToSearchParams(query);
  const search = params ? `?${params}` : "";

  if (mode === "push" && search !== location.search) {
    history.pushState(null, "", search || location.pathname);
  } else {
    history.replaceState(null, "", search || location.pathname);
  }
  // The tab's title too, so history and bookmarks have useful names
  document.title = `${resultsTitle()} – Shop`;
}

// What the last Back-button step was for. Typing "wireless headphones"
// with a few pauses would otherwise add a step for "wire", "wireless" and
// "wireless head"; instead one search gets one step, kept up to date.
let lastChange = null;

// The shopper changed something: draw it, and decide about the Back button
function commit(change) {
  const sameSearchStillGoing = change === "search" && lastChange === "search";
  lastChange = change;
  render({ history: sameSearchStillGoing ? "replace" : "push" });
}

// Back or Forward was pressed. The URL has already changed; read the query
// from it and redraw. (render() then only REPLACES, never pushes, or
// Forward would stop working.)
function handlePopState() {
  query = searchParamsToQuery(location.search, catalog.categories.map((c) => c.slug));
  lastChange = null;
  showQueryInControls();
  render();
}

// Make every control show the query (when the page opens from a link,
// and after Back or Forward)
function showQueryInControls() {
  elements.searchInput.value = query.search;
  elements.sortSelect.value = query.sort;
  writeFilters(query);
  // The category ticks are set by render()
}

// ===== Search =====
function search() {
  const search = elements.searchInput.value.trim();
  if (search === query.search) return;
  query = { ...query, search, page: 1 };
  commit("search");
}

const searchSoon = debounce(search, SEARCH_DELAY_MS);

// Enter searches straight away, and doesn't reload the page
function handleSearchSubmit(event) {
  event.preventDefault();
  searchSoon.flush();
}

// ===== Filters =====
// Read the whole filter form into the query. Every filter goes through
// here, so they can never get out of step with each other.
function applyFilters() {
  const filters = readFilters();
  const { minPrice, maxPrice } = orderPriceRange(
    parsePrice(filters.minPriceText),
    parsePrice(filters.maxPriceText)
  );
  const next = {
    ...query,
    categories: filters.categories,
    minPrice,
    maxPrice,
    minRating: filters.minRating,
    inStock: filters.inStock,
    onSale: filters.onSale,
  };
  // Nothing actually changed (e.g. "50" -> "50."): don't redraw, and
  // don't lose your page
  if (JSON.stringify(next) === JSON.stringify(query)) return;
  query = { ...next, page: 1 };
  commit("filters");
}

const applyFiltersSoon = debounce(applyFilters, PRICE_DELAY_MS);

// One listener for the whole form. Checkboxes and radios apply at once;
// typing a price waits for a pause.
function handleFiltersInput(event) {
  if (event.target.type === "number") applyFiltersSoon();
  else applyFilters();
}

// Leaving a price box (or pressing Enter in it) applies it straight away,
// and tidies what's shown: "100" to "20" becomes "20" to "100"
function handlePriceDone() {
  applyFiltersSoon.flush();
  writeFilters(query);
}

// ===== Sorting =====
function handleSortChange() {
  query = { ...query, sort: elements.sortSelect.value, page: 1 };
  commit("sort");
}

// ===== Pages =====
// One listener for every page button (they're rebuilt on each render)
function handlePaginationClick(event) {
  const button = event.target.closest(".page-btn");
  if (!button || button.disabled) return;

  query = { ...query, page: Number(button.dataset.page) };
  commit("page");

  // Back to the top of the results. Focusing the heading also moves
  // screen readers and keyboard users there, instead of leaving them at
  // the bottom of a page they can no longer see.
  elements.resultsTitle.focus({ preventScroll: true });
  elements.resultsTitle.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ===== Active filter chips =====
// One listener for every chip (they're rebuilt on each render)
function handleChipClick(event) {
  const button = event.target.closest(".chip");
  if (!button) return;

  if (button.dataset.chipId === "clear-all") {
    clearAll();
    elements.resultsTitle.focus();
    return;
  }

  const chips = activeFilterChips(query, categoryNames);
  const index = chips.findIndex((chip) => chip.id === button.dataset.chipId);
  if (index === -1) return;

  // Undo just this one filter, then make the form and search box match
  query = { ...query, ...chips[index].remove, page: 1 };
  showQueryInControls();
  commit(chips[index].id === "search" ? "search-cleared" : "filters");
  focusChipAt(index);
}

// ===== Filter drawer (small screens) =====
let isDrawerOpen = false;

function openFilters() {
  isDrawerOpen = true;
  setFiltersOpen(true);
  // Into the drawer, so keyboard and screen reader users start there
  elements.filtersClose.focus();
}

// returnFocus: false when the drawer closes itself because the screen got
// wider (there's no button to go back to then)
function closeFilters({ returnFocus = true } = {}) {
  if (!isDrawerOpen) return;
  isDrawerOpen = false;
  applyFiltersSoon.flush(); // a price still being typed counts
  setFiltersOpen(false);
  if (returnFocus) elements.filtersToggle.focus();
}

// Esc closes it, like any dialog
function handleDrawerKeydown(event) {
  if (event.key === "Escape" && isDrawerOpen) closeFilters();
}

// A tap on the darkened page outside the drawer closes it
function handleOutsideClick(event) {
  if (!isDrawerOpen) return;
  if (elements.filters.contains(event.target) || elements.filtersToggle.contains(event.target)) return;
  closeFilters();
}

// Rotating a tablet or widening the window: the drawer becomes the
// normal sidebar again, so it mustn't stay "open"
function handleScreenChange() {
  if (!drawerScreen.matches) closeFilters({ returnFocus: false });
}

// Back to a fresh start: no search, no filters. The sort order stays:
// it's how you like to look at things, not something you filtered by.
function clearAll() {
  query = { ...EMPTY_QUERY, sort: query.sort };
  elements.searchInput.value = "";
  writeFilters(query);
  commit("clear");
}

// ===== Start =====
async function start() {
  showStatus({ icon: "⏳", message: "Loading products…" });
  elements.grid.hidden = true;

  try {
    catalog = await loadCatalog();
  } catch (error) {
    showStatus({
      icon: "⚠️",
      message: error.message,
      action: { label: "Try again", onClick: start },
    });
    return;
  }

  categoryNames = Object.fromEntries(catalog.categories.map((c) => [c.slug, c.name]));
  renderCategoryOptions(catalog.categories);

  // Start from whatever the URL asks for. The categories have to be loaded
  // first, to know which category names in the URL are real.
  query = searchParamsToQuery(location.search, catalog.categories.map((c) => c.slug));
  showQueryInControls();
  render();
}

elements.searchInput.addEventListener("input", searchSoon);
// Leaving the search box ends that search: the next one gets its own step
elements.searchInput.addEventListener("blur", () => {
  searchSoon.flush();
  if (lastChange === "search") lastChange = null;
});
window.addEventListener("popstate", handlePopState);
elements.searchForm.addEventListener("submit", handleSearchSubmit);
elements.filtersForm.addEventListener("input", handleFiltersInput);
elements.priceMin.addEventListener("change", handlePriceDone);
elements.priceMax.addEventListener("change", handlePriceDone);
elements.clearFilters.addEventListener("click", clearAll);
elements.sortSelect.addEventListener("change", handleSortChange);
elements.pagination.addEventListener("click", handlePaginationClick);
elements.activeFilters.addEventListener("click", handleChipClick);
elements.filtersToggle.addEventListener("click", openFilters);
elements.filtersClose.addEventListener("click", () => closeFilters());
elements.filtersDone.addEventListener("click", () => closeFilters());
document.addEventListener("keydown", handleDrawerKeydown);
document.addEventListener("click", handleOutsideClick);
drawerScreen.addEventListener("change", handleScreenChange);
// The filters are a form only for its built-in controls; never submit it.
// (Enter in a price box tries to submit: treat it as "done".)
elements.filtersForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handlePriceDone();
});

start();
