// Everything on the page that shows the cart: the header button, the
// "Add to cart" buttons on product cards, and (next steps) the cart
// drawer. Like ui.js, these functions only draw; they never change the cart.
import { quantityOf, itemCount, maxQuantity, MAX_PER_PRODUCT } from "./cart.js";
import { formatPrice } from "./format.js";
import { FREE_SHIPPING_FROM_CENTS } from "./totals.js";

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
  shippingMessage: document.getElementById("shipping-message"),
  shippingProgress: document.getElementById("shipping-progress"),
  subtotal: document.getElementById("summary-subtotal"),
  savingsRow: document.getElementById("summary-savings-row"),
  savings: document.getElementById("summary-savings"),
  shipping: document.getElementById("summary-shipping"),
  tax: document.getElementById("summary-tax"),
  total: document.getElementById("summary-total"),
  checkoutBtn: document.getElementById("checkout-btn"),
  promoForm: document.getElementById("promo-form"),
  promoInput: document.getElementById("promo-input"),
  promoMessage: document.getElementById("promo-message"),
  promoRow: document.getElementById("summary-promo-row"),
  promoCode: document.getElementById("summary-promo-code"),
  promoAmount: document.getElementById("summary-promo"),
  promoRemove: document.getElementById("promo-remove"),
  notice: document.getElementById("cart-notice"),
  toast: document.getElementById("toast"),
  toastMessage: document.getElementById("toast-message"),
  toastUndo: document.getElementById("toast-undo"),
  orderDialog: document.getElementById("order"),
  orderSummary: document.getElementById("order-summary"),
  orderClose: document.getElementById("order-close"),
};

// ===== Undo toast =====
export function showToast(message) {
  cartElements.toastMessage.textContent = message;
  cartElements.toast.hidden = false;
}

export function hideToast() {
  cartElements.toast.hidden = true;
}

// ===== Order confirmation =====
// orderNumber: e.g. "A7F3C1", totals: what was "paid"
export function showOrderConfirmation(orderNumber, totals) {
  const items = `${totals.itemCount} item${totals.itemCount === 1 ? "" : "s"}`;
  const number = document.createElement("strong");
  number.textContent = `#${orderNumber}`;
  cartElements.orderSummary.replaceChildren(
    "Order ", number, ` · ${items} · ${formatPrice(totals.totalCents)}`
  );
  cartElements.orderDialog.showModal();
}

// ===== Notice at the top of the cart =====
// sentences: from describeChanges(), e.g. ["Lamp sold out and was removed."]
export function renderCartNotice(sentences) {
  cartElements.notice.hidden = sentences.length === 0;
  cartElements.notice.textContent = sentences.join(" ");
}

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
// Clearing first means the same message twice in a row is still read out.
// A short timer (not requestAnimationFrame) puts the message back: frames
// pause when the window isn't being drawn, and an announcement shouldn't
// wait for that. The newest message always wins.
let announceTimer = null;

export function announce(message) {
  clearTimeout(announceTimer);
  cartElements.announcer.textContent = "";
  announceTimer = setTimeout(() => {
    cartElements.announcer.textContent = message;
  }, 50);
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

// ===== The cart drawer: free shipping and the summary =====
// "Add $12.50 more for free shipping" with a bar filling up, or a
// "you've got it" message once the cart is over the line
function renderShipping(totals) {
  const remaining = totals.freeShippingRemainingCents;
  const message = cartElements.shippingMessage;

  if (remaining > 0) {
    // Built from nodes (not innerHTML) so only the amount is bold
    const amount = document.createElement("strong");
    amount.textContent = formatPrice(remaining);
    message.replaceChildren("Add ", amount, " more for free shipping");
  } else {
    message.textContent = "🎉 You've got free shipping!";
  }

  // The bar's max is the free-shipping line itself, in cents. Anything
  // over it just shows a full bar.
  cartElements.shippingProgress.max = FREE_SHIPPING_FROM_CENTS;
  cartElements.shippingProgress.value = Math.min(totals.subtotalCents, FREE_SHIPPING_FROM_CENTS);
}

function renderSummary(totals) {
  cartElements.subtotal.textContent = formatPrice(totals.subtotalCents);

  // Only show savings when there are some; a "−$0.00" line is just noise
  cartElements.savingsRow.hidden = totals.savingsCents === 0;
  cartElements.savings.textContent = `−${formatPrice(totals.savingsCents)}`;

  cartElements.shipping.textContent =
    totals.shippingCents === 0 ? "Free" : formatPrice(totals.shippingCents);
  cartElements.tax.textContent = formatPrice(totals.taxCents);
  cartElements.total.textContent = formatPrice(totals.totalCents);
  // The amount on the button too, so it's clear what "Checkout" means
  cartElements.checkoutBtn.textContent = `Checkout · ${formatPrice(totals.totalCents)}`;
}

// ===== Promo code =====
function setPromoMessage(text, kind) {
  cartElements.promoMessage.textContent = text;
  cartElements.promoMessage.classList.toggle("promo__message--error", kind === "error");
  cartElements.promoMessage.classList.toggle("promo__message--success", kind === "success");
}

// The promo row in the summary, and the message under the box.
// typedError: a problem with a code that was typed but NOT applied
// ("FREEMONEY isn't a valid code"), or "".
function renderPromo(totals, typedError) {
  const { promo } = totals;
  cartElements.promoRow.hidden = !promo;

  if (promo) {
    cartElements.promoCode.textContent = promo.code;
    if (!promo.ok) {
      cartElements.promoAmount.textContent = "Not applied";
    } else if (promo.promo.type === "shipping") {
      cartElements.promoAmount.textContent = "Free shipping";
    } else {
      cartElements.promoAmount.textContent = `−${formatPrice(totals.promoCents)}`;
    }
  }

  // A typed mistake wins; otherwise describe the applied code
  if (typedError) {
    setPromoMessage(typedError, "error");
  } else if (promo?.ok) {
    setPromoMessage(`✓ ${promo.code}: ${promo.promo.description}`, "success");
  } else if (promo?.reason === "minimum") {
    // The code is kept: add a little more and it switches back on
    setPromoMessage(
      `${promo.code} needs ${formatPrice(promo.promo.minSubtotalCents)} in your cart. ` +
        `Add ${formatPrice(promo.shortByCents)} more to use it.`,
      "error"
    );
  } else {
    setPromoMessage("", null);
  }
}

// What went wrong with a typed code, in words (checkPromo()'s reasons)
export function promoErrorMessage(result) {
  if (result.reason === "empty") return "Type a promo code first.";
  if (result.reason === "unknown") return `“${result.code}” isn't a valid code.`;
  return "";
}

// totals: from calculateTotals()
// typedPromoError: see renderPromo()
export function renderCartDrawer(totals, typedPromoError = "") {
  const isEmpty = totals.lines.length === 0;
  cartElements.empty.hidden = !isEmpty;
  cartElements.content.hidden = isEmpty;
  cartElements.titleCount.textContent = isEmpty ? "" : `(${totals.itemCount})`;
  renderLines(totals.lines);
  renderShipping(totals);
  renderSummary(totals);
  renderPromo(totals, typedPromoError);
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
