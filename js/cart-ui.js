// Everything on the page that shows the cart: the header button, the
// "Add to cart" buttons on product cards, and (next steps) the cart
// drawer. Like ui.js, these functions only draw; they never change the cart.
import { quantityOf, itemCount, maxQuantity, MAX_PER_PRODUCT } from "./cart.js";

export const cartElements = {
  grid: document.getElementById("product-grid"),
  cartBtn: document.getElementById("cart-btn"),
  cartCount: document.getElementById("cart-count"),
  announcer: document.getElementById("announcer"),
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
