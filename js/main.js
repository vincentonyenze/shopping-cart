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
  EMPTY_CART,
  addToCart,
  itemCount,
  quantityOf,
  setQuantity,
  removeFromCart,
  restoreItem,
} from "./cart.js";
import { calculateTotals } from "./totals.js";
import { checkPromo } from "./promos.js";
import {
  STORAGE_KEY,
  loadSavedCart,
  reconcileSavedCart,
  describeChanges,
  saveCart,
} from "./saved-cart.js";
import {
  renderCartButton,
  updateAddButtons,
  flashAdded,
  announce,
  limitMessage,
  cartElements,
  renderCartDrawer,
  focusLineAt,
  promoErrorMessage,
  renderCartNotice,
  showToast,
  hideToast,
  showOrderConfirmation,
} from "./cart-ui.js";
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
// id -> product, for instant lookups from the cart
let productsById = new Map();

// What's in the cart: { items: [{ productId, quantity }] }. Saved in
// localStorage on every change, so it survives a refresh.
let cart = EMPTY_CART;
// Sentences about what changed in a saved cart since it was saved
// ("Lamp sold out and was removed."), shown at the top of the cart until
// it's next closed
let cartNotice = [];
// The promo code the shopper applied ("SAVE10"), or null. It's kept even
// if the cart drops below its minimum, so it switches back on by itself.
let promoCode = null;
// A typed code that wasn't accepted ("FREEMONEY isn't a valid code"), or ""
let promoError = "";

// The cart's totals right now, with the promo
function cartTotals() {
  return calculateTotals(cart, productsById, promoCode);
}

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
  updateAddButtons(cart, productsById);
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

// ===== The cart =====
// Every change to the cart goes through here, so the badge and the
// buttons can never get out of step with it.
// Returns " You've got free shipping!" when this change crossed the line
// (or ""), so the caller can add it to what it announces.
// save: false when the change came FROM storage (another tab), so it isn't
// written straight back
function updateCart(nextCart, { bump = false, save = true } = {}) {
  const before = cartTotals();
  cart = nextCart;
  const after = cartTotals();
  if (save) saveCart(cart, promoCode, productsById);

  renderCartButton(cart, { bump });
  updateAddButtons(cart, productsById);
  renderCartDrawer(after, promoError);

  const unlocked = before.freeShippingRemainingCents > 0 && after.freeShippingRemainingCents === 0;
  return unlocked ? " You've got free shipping!" : "";
}

// One listener for every "Add to cart" button in the grid
function handleAddClick(event) {
  const button = event.target.closest(".add-btn");
  if (!button) return;
  const product = productsById.get(Number(button.closest(".product-card").dataset.productId));
  if (!product) return;

  const result = addToCart(cart, product);
  if (result.added === 0) {
    // Usually the button is already disabled; this covers a quick double click
    announce(limitMessage(result.limitedBy, product));
    return;
  }

  const extra = updateCart(result.cart, { bump: true });
  flashAdded(button, () => updateAddButtons(cart, productsById));
  const count = itemCount(cart);
  announce(`Added ${product.name} to your cart. ${count} item${count === 1 ? "" : "s"} in cart.${extra}`);
}

// ===== The cart drawer =====
function openCart() {
  renderCartDrawer(cartTotals(), promoError);
  // showModal(): Esc closes it, the page behind is blocked, and focus
  // moves inside. When it closes, focus goes back to the 🛒 button.
  cartElements.drawer.showModal();
}

function closeCart() {
  cartElements.drawer.close();
}

// However the cart was closed (✕, Esc, backdrop): the notice has been seen
function handleCartClosed() {
  cartNotice = [];
  renderCartNotice(cartNotice);
  // Leaving the cart makes the last removal final
  forgetRemoved();
}

// ===== Saved cart =====
// Bring back the cart saved in this browser, checked against today's
// catalog. Returns sentences about anything that had to change.
function restoreSavedCart() {
  const restored = reconcileSavedCart(loadSavedCart(), productsById);
  cart = restored.cart;
  promoCode = restored.promoCode;
  return describeChanges(restored.changes);
}

// Another tab changed the cart. The "storage" event only fires in the
// OTHER tabs, never the one that saved, so tabs can't keep echoing each
// other's changes back and forth.
function handleStorage(event) {
  if (event.key !== STORAGE_KEY && event.key !== null) return; // null: storage cleared
  const restored = reconcileSavedCart(loadSavedCart(), productsById);
  promoCode = restored.promoCode;
  promoError = "";
  updateCart(restored.cart, { save: false });
}

// Clicks on the dark backdrop land on the <dialog> element itself
function handleDrawerClick(event) {
  if (event.target === cartElements.drawer) closeCart();
}

// − / + and Remove, for every line (one listener on the list)
function handleLinesClick(event) {
  const line = event.target.closest(".cart-line");
  if (!line) return;
  const product = productsById.get(Number(line.dataset.productId));

  const stepButton = event.target.closest(".stepper__btn");
  if (stepButton) {
    changeQuantity(product, quantityOf(cart, product.id) + Number(stepButton.dataset.step));
    return;
  }

  if (event.target.closest(".cart-line__remove")) {
    const result = removeFromCart(cart, product.id);
    updateCart(result.cart);
    offerUndo(result, product);
    focusLineAt(result.index);
  }
}

// A number typed into a quantity box, applied when you leave the box or
// press Enter ("change" fires then, not on every key)
function handleQuantityTyped(event) {
  const input = event.target.closest(".stepper__input");
  if (!input) return;
  const product = productsById.get(Number(input.closest(".cart-line").dataset.productId));
  const typed = input.value.trim() === "" ? NaN : Number(input.value);
  changeQuantity(product, typed);
  // Show what the cart actually holds now (e.g. 99 became 10)
  input.value = quantityOf(cart, product.id) || "";
}

function changeQuantity(product, quantity) {
  const result = setQuantity(cart, product, quantity);
  const extra = updateCart(result.cart);
  // Typing 0 removes the product, so it gets an Undo too
  if (result.removed) {
    offerUndo(result, product);
    return;
  }
  const message = (result.limitedBy ? limitMessage(result.limitedBy, product) : "") + extra;
  if (message) announce(message.trim());
}

// ===== Undo =====
// How long "Removed … · Undo" stays before the removal is final. The
// countdown pauses while the pointer or keyboard focus is on the toast,
// so nobody loses their chance while reaching for the button.
const UNDO_MS = 8000;
// What was last removed and where, so Undo can put it back: { item, index, product }
let lastRemoved = null;
let undoTimer = null;

// result: from removeFromCart() (it says what was removed and where)
function offerUndo(result, product) {
  lastRemoved = { item: result.removed, index: result.index, product };
  showToast(`Removed ${product.name}`);
  announce(`Removed ${product.name} from your cart. Undo is available for a few seconds.`);
  startUndoCountdown();
}

function startUndoCountdown() {
  clearTimeout(undoTimer);
  if (lastRemoved) undoTimer = setTimeout(forgetRemoved, UNDO_MS);
}

function pauseUndoCountdown() {
  clearTimeout(undoTimer);
}

function forgetRemoved() {
  clearTimeout(undoTimer);
  lastRemoved = null;
  hideToast();
}

function handleUndo() {
  if (!lastRemoved) return;
  const { item, index, product } = lastRemoved;
  forgetRemoved();
  updateCart(restoreItem(cart, item, index));
  announce(`${product.name} is back in your cart.`);
  // Back onto the line that came back (the Undo button has just gone)
  cartElements.lines
    .querySelector(`.cart-line[data-product-id="${product.id}"] .stepper__input`)
    ?.focus();
}

// ===== Checkout =====
// A pretend checkout: no payment, nothing is sent anywhere. It "places"
// the order, empties the cart and shows a confirmation.
function handleCheckout() {
  const totals = cartTotals();
  if (totals.itemCount === 0) return;

  // A short random order number, e.g. "A7F3C1"
  const orderNumber = crypto.randomUUID().slice(0, 6).toUpperCase();

  closeCart();
  promoCode = null;
  promoError = "";
  updateCart(EMPTY_CART);
  // The confirmation is a dialog too; when it closes, focus goes back to
  // the 🛒 button, which is where it was before
  showOrderConfirmation(orderNumber, totals);
  announce(`Order ${orderNumber} placed. Thank you!`);
}

// ===== Promo codes =====
function handlePromoSubmit(event) {
  event.preventDefault();
  const typed = cartElements.promoInput.value;
  const result = checkPromo(typed, cartTotals().subtotalCents);

  if (result.ok || result.reason === "minimum") {
    // Keep a real code even if the cart is short of its minimum: the
    // message explains how much more is needed
    promoCode = result.code;
    promoError = "";
    cartElements.promoInput.value = "";
    saveCart(cart, promoCode, productsById);
  } else {
    promoError = promoErrorMessage(result);
  }
  const totals = cartTotals();
  renderCartDrawer(totals, promoError);
  announce(cartElements.promoMessage.textContent);
}

function removePromo() {
  const removed = promoCode;
  promoCode = null;
  promoError = "";
  saveCart(cart, promoCode, productsById);
  renderCartDrawer(cartTotals(), promoError);
  announce(`Removed promo code ${removed}.`);
  cartElements.promoInput.focus(); // the Remove button just disappeared
}

// Typing a new code clears the old error, so it doesn't sit there looking
// like it's about the new code
function handlePromoTyping() {
  if (!promoError) return;
  promoError = "";
  renderCartDrawer(cartTotals(), promoError);
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
  productsById = new Map(catalog.products.map((product) => [product.id, product]));

  // The cart from last time, fixed up for anything that changed since
  cartNotice = restoreSavedCart();
  renderCartButton(cart);
  renderCartNotice(cartNotice);
  if (cartNotice.length > 0) {
    saveCart(cart, promoCode, productsById); // save the fixed version
    announce(`Your cart was updated since your last visit. ${cartNotice.join(" ")}`);
  }
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
elements.grid.addEventListener("click", handleAddClick);
cartElements.cartBtn.addEventListener("click", openCart);
cartElements.drawerClose.addEventListener("click", closeCart);
cartElements.continueBtn.addEventListener("click", closeCart);
cartElements.drawer.addEventListener("click", handleDrawerClick);
cartElements.lines.addEventListener("click", handleLinesClick);
cartElements.lines.addEventListener("change", handleQuantityTyped);
cartElements.promoForm.addEventListener("submit", handlePromoSubmit);
cartElements.promoRemove.addEventListener("click", removePromo);
cartElements.promoInput.addEventListener("input", handlePromoTyping);
cartElements.drawer.addEventListener("close", handleCartClosed);
cartElements.toastUndo.addEventListener("click", handleUndo);
cartElements.toast.addEventListener("mouseenter", pauseUndoCountdown);
cartElements.toast.addEventListener("mouseleave", startUndoCountdown);
cartElements.toast.addEventListener("focusin", pauseUndoCountdown);
cartElements.toast.addEventListener("focusout", startUndoCountdown);
cartElements.checkoutBtn.addEventListener("click", handleCheckout);
cartElements.orderClose.addEventListener("click", () => cartElements.orderDialog.close());
window.addEventListener("storage", handleStorage);
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
