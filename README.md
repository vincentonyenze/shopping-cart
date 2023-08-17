# Shopping Cart

A shop with a fully working cart: add products, change quantities, see your savings, shipping and tax, use promo codes, and come back later to find your cart still there, checked against the latest prices and stock. Built with plain HTML, CSS and JavaScript (no frameworks or libraries) and covered by **169 automated tests**.

This is **Project 12** in my beginner-to-expert web development roadmap (Level 2). It builds on [Project 11, the Product Catalog](https://github.com/vincentonyenze/product-catalog): search, filters, sorting, pagination and shareable URLs all carry over.

<!-- Add a screenshot: save one as screenshot.png in this folder and uncomment the line below -->
<!-- ![Shopping cart screenshot](screenshot.png) -->

## Features

### The cart
- **Add to cart** buttons that show where you are: *Add another (2 in cart)*, *All 3 in your cart*, *Sold out*
- A header **badge** with the item count, which bumps when something is added
- A **slide-in cart** with photos, **− 2 +** quantity steppers (or type a number) and Remove
- **Stock limits** and a maximum of 10 per product, with notes explaining why **+** stopped
- **Undo** after removing something (the countdown pauses while you're on it)

### The money
- **Subtotal, sale savings, shipping, 8% tax and total**, all calculated in whole cents
- **Free shipping from $50**, with *"Add $12.50 more for free shipping"* and a progress bar
- **Promo codes**, re-checked on every change:

  | Code | Does | Minimum |
  |---|---|---|
  | `SAVE10` | 10% off | $30 |
  | `WELCOME5` | $5 off | $20 |
  | `FREESHIP` | free shipping | none |

- A pretend **checkout** with an order number (nothing is charged)

### Saved between visits
- The cart and promo code are saved in the browser and **survive a refresh**
- A saved cart is **checked against today's catalog**: products that are gone or sold out are removed, quantities above the stock are lowered, and **price changes** are noticed. Every change is explained at the top of the cart.
- Changes in one tab **appear instantly in every other open tab**

### From the catalog (Project 11)
- Search, category / price / rating / stock / sale filters, sorting and pagination
- Everything in the URL: refresh, bookmark, share, and the Back button works
- 194 real products with photos

## How the money is worked out

```
subtotal          = Σ (price after sale × quantity)
− promo           = SAVE10: 10% of subtotal · WELCOME5: $5 (never more than the subtotal)
+ shipping        = $5.99, or free from a $50 subtotal (or with FREESHIP)
+ tax             = 8% of (subtotal − promo), rounded once
= total
```

- **Everything is in cents** (`1999` = $19.99), so `3 × $19.99` is exactly `5997`, never `59.970000000000006`.
- **Free shipping is earned before the promo**, so a discount never makes you lose it.
- **Tax is rounded once** on the whole amount, not line by line, so the total matches what a customer would calculate.
- **Nothing about the money is stored.** The cart only remembers `{ productId, quantity }`; prices always come from the catalog, and every total is recalculated on every change.

## Built with

- HTML5 (`<dialog>` with `showModal()`, `<template>`, `<progress>`, `<dl>`, `aria-live`, `aria-haspopup`)
- CSS3 (a `<dialog>` turned into a side drawer, `:has()`, `::backdrop`, sticky footers, `font-variant-numeric: tabular-nums`)
- Vanilla JavaScript (ES6+) in ES modules
- `localStorage` and the `storage` event, `Intl.NumberFormat`, `crypto.randomUUID()`
- **Node's built-in test runner** (`node --test`)

## What I learned

- **Designing state:** storing only ids and quantities, and deriving everything else
- **Money in cents**, rounding once, and the order of discounts, shipping and tax
- **Business rules as tested pure functions:** stock limits, free shipping, promo minimums
- **Functions that explain themselves:** returning *why* something stopped (`limitedBy`), not just the new data
- **Updating a list by key** (the idea behind React's `key`), so focus isn't lost when a quantity changes
- **Saved data goes stale:** reconciling a saved cart with today's catalog, and telling the user what changed
- **Syncing tabs** with the `storage` event
- **`<dialog>`** for modal behaviour, and why a toast must be inside the open modal
- **Undo instead of confirmation**, and not taking it away from people who need more time
- **Never trusting the browser with discounts:** in a real shop, codes and prices are checked on the server

## How to run

1. Clone the repository:
   ```bash
   git clone https://github.com/vincentonyenze/shopping-cart.git
   cd shopping-cart
   ```
2. Open the folder in VS Code and start **Live Server** (right-click `index.html` → *Open with Live Server*).

A local server is needed because browsers block ES modules, and `fetch()` of local files, on pages opened straight from a file (`file://`).

## Running the tests

You need [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm test             # run all tests once
npm run test:watch   # re-run them every time a file is saved
```

| File | Tests | Covers |
|---|---|---|
| `tests/catalog.test.js` | 66 | search, filters, counts, sorting, pagination (from Project 11) |
| `tests/cart.test.js` | 21 | adding, quantities, stock and per-order limits, removing, undo |
| `tests/promos.test.js` | 18 | checking codes, minimums, discounts, promos in the totals |
| `tests/url.test.js` | 15 | query ⇄ URL (from Project 11) |
| `tests/saved-cart.test.js` | 14 | saving, damaged data, reconciling with the catalog, change messages |
| `tests/format.test.js` | 13 | prices, stars, stock labels |
| `tests/totals.test.js` | 12 | subtotal, savings, shipping, tax, total, missing products |
| `tests/chips.test.js` | 10 | active filter chips (from Project 11) |

## Project structure

```
shopping-cart/
├── index.html           # Shop page, cart dialog, line template, order confirmation
├── style.css            # Catalog styles + cart button, drawer, stepper, summary, toast
├── package.json         # npm scripts for the tests
├── data/products.json   # 194 products (prices in cents)
├── images/products/     # One photo per product
├── js/
│   ├── main.js          # Connects everything: catalog, cart, promo, saving, undo, checkout
│   ├── cart.js          # Cart engine: add, set quantity, remove, restore, limits
│   ├── totals.js        # Subtotal, savings, promo, shipping, tax, total
│   ├── promos.js        # Promo codes and their rules
│   ├── saved-cart.js    # Saving, loading and reconciling the cart with the catalog
│   ├── cart-ui.js       # Drawing the cart: badge, buttons, lines, summary, toast
│   ├── catalog.js       # Search, filters, counts, sorting, pagination
│   ├── url.js           # Query ⇄ URL
│   ├── chips.js         # Active filter chips
│   ├── format.js        # Prices, stars, stock labels
│   ├── api.js           # Loading the catalog
│   ├── ui.js            # Drawing the catalog
│   └── utils.js         # debounce
├── tests/               # Automated tests (node --test)
└── README.md
```

## Known limitations

- **Everything runs in the browser.** Prices, stock and promo codes can be changed by anyone in DevTools. A real shop checks all of them on a server at checkout (Level 4 of my roadmap).
- Checkout is pretend: no payment, and stock isn't reduced after an order.
- The cart is saved in this browser only, not across devices.
- Only one promo code at a time.

## Possible improvements

- A product details page with its own URL
- "Saved for later" for products you're not ready to buy
- Delivery options with different prices
- A real checkout with a payment provider in test mode (Level 5)

## Credits

Product names, descriptions and photos come from [DummyJSON](https://dummyjson.com/), a free set of sample data for practising web development.
