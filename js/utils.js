// Small helpers that don't depend on the page or the products

// Wait until calls stop for `delayMs`, then run `fn` once with the latest
// arguments. Typing "headphones" quickly = 1 search, not 10.
// debounced.flush() runs a waiting call right now (e.g. when Enter is pressed).
// (The same helper as in the Notes and Movie apps.)
export function debounce(fn, delayMs) {
  let timeoutId = null;
  let lastArgs = [];

  function run() {
    timeoutId = null;
    fn(...lastArgs);
  }

  function debounced(...args) {
    lastArgs = args;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(run, delayMs);
  }

  debounced.flush = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      run();
    }
  };

  return debounced;
}
