// Everything on the page that shows the cart: the header button, the
// "Add to cart" buttons on product cards, and (next steps) the cart
// drawer. Like ui.js, these functions only draw; they never change the cart.
import { quantityOf, itemCount, maxQuantity, MAX_PER_PRODUCT } from "./cart.js";
import { formatPrice } from "./format.js";

export const cartElements = {
  grid: document.getElementById("product-grid"),
  cartBtn: document.getElementById("cart-btn"),
  cartCount: document.getElementById("cart-count"),
  announcer: document.getElementById("announcer"),
  drawer: document.getElementById("cart"),
  drawerClose: document.getElementById("cart-close"),
  titleCount: document.getElementById("cart-title-count"),
  empty: document.getElementById("cart-empty"),
  continueBtn: document.getElementById("cart-continue"),
  content: document.getElementById("cart-content"),
  lines: document.getElementById("cart-lines"),
  lineTemplate: document.getElementById("cart-line-template"),
};

// How long "Added ✓" shows before the button goes back to normal
const ADDED_FLASH_MS = 1200;

// ===== Header button =====
export function renderCartButton(cart, { bump = false } = {}) {
  const count = itemCount(cart);
  cartElements.cartCount.textContent = count;
  cartElements.cartCount.hidden = count === 0;
  // The badge is just a number, so the button says it in words
  cartElements.cartBtn.setAttribute(
    "aria-label",
    count === 0 ? "Cart, empty" : `Cart, ${count} item${count === 1 ? "" : "s"}`
  );

  if (bump) {
    // Removing and re-adding the class restarts the animation; reading
    // offsetWidth in between makes the browser notice the removal
    cartElements.cartCount.classList.remove("cart-btn__count--bump");
    void cartElements.cartCount.offsetWidth;
    cartElements.cartCount.classList.add("cart-btn__count--bump");
  }
}

// ===== "Add to cart" buttons =====
// What the button on a card should say for this product
function addButtonState(product, inCart) {
  const max = maxQuantity(product);
  if (product.stock === 0) return { text: "Sold out", disabled: true };
  if (inCart >= max) {
    return {
      text: max < MAX_PER_PRODUCT ? `All ${max} in your cart` : `Limit of ${MAX_PER_PRODUCT} reached`,
      disabled: true,
    };
  }
  if (inCart > 0) return { text: `Add another (${inCart} in cart)`, disabled: false, inCart: true };
  return { text: "Add to cart", disabled: false };
}

// Bring every visible card's button up to date with the cart.
// productsById: Map of id -> product
export function updateAddButtons(cart, productsById) {
  for (const card of cartElements.grid.querySelectorAll(".product-card")) {
    const product = productsById.get(Number(card.dataset.productId));
    const button = card.querySelector(".add-btn");
    if (!product || button.classList.contains("add-btn--added")) continue;

    const state = addButtonState(product, quantityOf(cart, product.id));
    button.textContent = state.text;
    button.disabled = state.disabled;
    button.classList.toggle("add-btn--in-cart", Boolean(state.inCart));
  }
}

// A moment of green "Added ✓" on the button that was clicked, then back
// to normal (updateAddButtons skips it while it's showing)
export function flashAdded(button, onDone) {
  clearTimeout(button.flashTimer);
  button.classList.add("add-btn--added");
  button.classList.remove("add-btn--in-cart");
  button.textContent = "Added ✓";
  button.flashTimer = setTimeout(() => {
    button.classList.remove("add-btn--added");
    onDone();
  }, ADDED_FLASH_MS);
}

// ===== Announcements =====
// Clearing first means the same message twice in a row is still read out
export function announce(message) {
  cartElements.announcer.textContent = "";
  requestAnimationFrame(() => {
    cartElements.announcer.textContent = message;
  });
}

// Why addToCart() stopped, in words: "Only 3 in stock"
export function limitMessage(limitedBy, product) {
  if (limitedBy === "sold-out") return `${product.name} is sold out.`;
  if (limitedBy === "stock") return `Only ${product.stock} of ${product.name} in stock: they're all in your cart.`;
  if (limitedBy === "max-per-order") return `You can order up to ${MAX_PER_PRODUCT} of each product.`;
  return "";
}

// ===== The cart drawer: lines =====
// Build a new line from the <template>. Only the parts that never change
// for this product are filled in here; updateLine() does the rest.
function createLine(product) {
  const item = lineParts(cartElements.lineTemplate.content.cloneNode(true).firstElementChild);
  item.root.dataset.productId = product.id;

  item.photo.src = product.image;
  item.photo.alt = ""; // the name is right next to it
  item.name.textContent = product.name;

  // Every control says which product it's for: a screen reader user
  // tabbing through hears "Increase quantity of iPhone 5s", not just "+"
  item.stepper.setAttribute("aria-label", `Quantity of ${product.name}`);
  item.minus.setAttribute("aria-label", `Decrease quantity of ${product.name}`);
  item.plus.setAttribute("aria-label", `Increase quantity of ${product.name}`);
  item.input.setAttribute("aria-label", `Quantity of ${product.name}`);
  item.input.max = maxQuantity(product);
  item.remove.setAttribute("aria-label", `Remove ${product.name} from cart`);
  return item.root;
}

// The parts of a line, found once by class name
function lineParts(root) {
  const $ = (name) => root.querySelector(`.${name}`);
  return {
    root,
    photo: $("cart-line__photo"),
    name: $("cart-line__name"),
    unit: $("cart-line__unit"),
    was: $("cart-line__was"),
    note: $("cart-line__note"),
    stepper: $("stepper"),
    minus: root.querySelector('[data-step="-1"]'),
    plus: root.querySelector('[data-step="1"]'),
    input: $("stepper__input"),
    total: $("cart-line__total"),
    remove: $("cart-line__remove"),
  };
}

// Bring a line up to date. line: one of calculateTotals()'s lines.
function updateLine(root, line) {
  const item = lineParts(root);
  const { product, quantity } = line;
  const max = maxQuantity(product);

  item.unit.textContent = formatPrice(line.unitCents);
  item.was.hidden = product.discountPercent === 0;
  item.was.textContent = formatPrice(product.priceCents);
  item.total.textContent = formatPrice(line.lineCents);

  // Don't overwrite the number while someone is typing in the box
  if (document.activeElement !== item.input) item.input.value = quantity;
  item.minus.disabled = quantity <= 1; // below 1 is "Remove", not "−"
  item.plus.disabled = quantity >= max;

  // Explain why + stopped working
  let note = "";
  if (quantity >= max) {
    note = max < MAX_PER_PRODUCT ? `Only ${max} in stock` : `Limit of ${MAX_PER_PRODUCT} per order`;
  } else if (product.stock <= 5) {
    note = `Only ${product.stock} left`;
  }
  item.note.textContent = note;
  item.note.hidden = note === "";
}

// Make the list match the lines, changing as little as possible.
// Each <li> is matched to its product by data-product-id (a "key"), so
// changing a quantity updates that one line in place. Rebuilding the whole
// list would replace the + button you just pressed, and keyboard focus
// would be thrown back to the top of the page.
function renderLines(lines) {
  const list = cartElements.lines;
  const existing = new Map(
    [...list.children].map((li) => [Number(li.dataset.productId), li])
  );

  lines.forEach((line, index) => {
    const li = existing.get(line.product.id) ?? createLine(line.product);
    existing.delete(line.product.id);
    updateLine(li, line);
    // Put it in the right place (only moves it if it isn't already there)
    if (list.children[index] !== li) list.insertBefore(li, list.children[index] ?? null);
  });

  // Whatever's left over is no longer in the cart
  for (const li of existing.values()) li.remove();
}

// totals: from calculateTotals()
export function renderCartDrawer(totals) {
  const isEmpty = totals.lines.length === 0;
  cartElements.empty.hidden = !isEmpty;
  cartElements.content.hidden = isEmpty;
  cartElements.titleCount.textContent = isEmpty ? "" : `(${totals.itemCount})`;
  renderLines(totals.lines);
}

// After a line is removed its buttons are gone: move focus to the line
// that took its place (or the one above), or "Continue shopping" if the
// cart is now empty
export function focusLineAt(index) {
  const lines = cartElements.lines.children;
  const line = lines[Math.min(index, lines.length - 1)];
  if (line) line.querySelector(".stepper__input").focus();
  else cartElements.continueBtn.focus();
}
