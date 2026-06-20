// eng-audit detection benchmark: each "dirty" case is a small code snippet with deliberately
// PLANTED principle violations; each "clean" case has none (to measure false positives). A
// violation is "caught" if the review text matches every regex in its `need` (an anchor identifier
// plus a problem word), so the same detector scores every arm identically. Keyword detection is a
// recall FLOOR, applied equally to all arms, so the between-arm comparison is fair.

export const ARMS = {
  baseline: "You are a senior engineer doing a code review. Review the code below and list the problems you find.",
  critical:
    "You are a senior engineer doing a code review. Review the code below and list the problems you find. " +
    "Be thorough and critical, and judge it against good software-engineering principles.",
  "eng-audit": "ENG_AUDIT_SKILL", // built at runtime: baseline + the SKILL.md body
};

export const CASES = [
  {
    id: "user-service",
    code: `// user-service.js
const store = new Map();
let lookups = 0;

export function getDisplayName(id) {
  lookups++;                       // tally every lookup
  const u = store.get(id);
  return u ? u.firstName + " " + u.lastName : "Unknown";
}

export function formatLegacyName(u) {
  return [u.lastName, u.firstName].join(", ");
}

export function addUser(u) {
  store.set(u.id, u);
}`,
    violations: [
      { principle: "no unspoken side effects", need: [/getDisplayName|lookups/i, /side[- ]?effect|mutat|global|increment|impure|counter/i] },
      { principle: "write less code", need: [/formatLegacyName/i, /unused|dead|never (called|used)|not (called|used)|remove|delete/i] },
    ],
  },
  {
    id: "create-order",
    code: `// orders.js
export function createOrder(body) {
  const order = {
    id: crypto.randomUUID(),
    amount: body.amount,
    quantity: body.quantity,
  };
  charge(body.amount * body.quantity);
  return order;
}`,
    violations: [
      { principle: "handle failure at the edges (validation)", need: [/amount|quantity|body|input/i, /validat|sanitiz|unchecked|negative|undefined|missing check|no check|trust/i] },
    ],
  },
  {
    id: "cart",
    code: `// cart.js
export function addItem(cart, item) {
  cart.push(item);                 // add the item to the cart
  return cart;
}

export function total(cart) {
  let sum = 0;
  // loop over the items
  for (let i = 0; i < cart.length; i++) {
    sum = sum + cart[i].price;
  }
  return sum;
}`,
    violations: [
      { principle: "prefer functional over imperative", need: [/addItem|cart/i, /mutat|push|in[- ]?place|input|argument|param|side[- ]?effect/i] },
      { principle: "comments explain why, not what", need: [/comment/i, /what|restat|obvious|redundant|narrat|loop over/i] },
    ],
  },
  {
    id: "auth-test",
    code: `// auth.test.js
import { isExpired } from "./auth.js";

test("token expiry", () => {
  try {
    const result = isExpired({ exp: Date.now() - 1000 });
    expect(result).toBe(true);
  } catch (e) {
    // ignore errors for now
  }
  expect(true).toBe(true);
});`,
    violations: [
      { principle: "tests to the highest standard", need: [/test|assert|expect/i, /always pass|tautolog|meaningless|swallow|catch|true\)\.toBe\(true\)|asserts? nothing|wrong reason/i] },
    ],
  },
  {
    id: "perm-check",
    code: `// perm.js
export function canEdit(user, doc) {
  if (user.role === 2 && doc.state !== 4) {
    return true;
  }
  return false;
}

export function configure(verbose, cache, retries, strict, dryRun) {
  // ... 40 lines using all five flags
}`,
    violations: [
      { principle: "keep coupling visible (connascence of meaning)", need: [/role === 2|state !== 4|magic|=== 2|!== 4/i, /magic (number|value)|constant|unclear|what (does )?2|named/i] },
      { principle: "keep coupling visible (connascence of position)", need: [/configure|positional|boolean|five (flags|args|parameters)|param/i, /positional|order|boolean (flags|params|args)|options object|hard to|easy to mix/i] },
    ],
  },
  {
    id: "settings-factory",
    code: `// settings.js
class SettingsProviderFactory {
  create() { return new SettingsProvider(); }
}
class SettingsProvider {
  get() { return { theme: "dark" }; }
}
export const TIMEOUT_CONFIG = { value: 30 };
export function getSettings() {
  return new SettingsProviderFactory().create().get();
}`,
    violations: [
      { principle: "write less code (over-abstraction)", need: [/factory|SettingsProvider|abstraction|indirection/i, /over[- ]?(engineer|abstract|built)|unnecessary|YAGNI|single implementation|too much|overkill|just (a|return)/i] },
    ],
  },
  // Genuinely-clean controls: small, documented, correct. A claim of a real DEFECT here is a false
  // positive. (Minor "you could add X" suggestions are fine and are not scored as false positives.)
  {
    id: "clean-clamp",
    clean: true,
    code: `// clamp.js
// Callers pass user-tunable bounds; we coerce once at the edge and keep the core pure.
export function clamp(value, min, max) {
  if (min > max) throw new RangeError("min must be <= max");
  return Math.min(Math.max(value, min), max);
}`,
  },
  {
    id: "clean-capitalize",
    clean: true,
    code: `// capitalize.js
// Returns the input unchanged when empty, so callers never hit an index error.
export function capitalize(s) {
  if (typeof s !== "string") throw new TypeError("expected a string");
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}`,
  },
  {
    id: "clean-in-range",
    clean: true,
    code: `// inRange.js
// Inclusive on both ends, as documented.
export function inRange(n, low, high) {
  return n >= low && n <= high;
}`,
  },
  {
    id: "clean-unique",
    clean: true,
    code: `// unique.js
// Order-preserving de-dupe using a Set (first occurrence wins).
export function unique(items) {
  return [...new Set(items)];
}`,
  },
  {
    id: "clean-sum",
    clean: true,
    code: `// sum.js
// Sum of a list of numbers; empty list is 0, which is the identity for addition.
export function sum(numbers) {
  return numbers.reduce((acc, n) => acc + n, 0);
}`,
  },
  {
    id: "clean-last",
    clean: true,
    code: `// last.js
// Returns undefined for an empty array, matching Array indexing semantics.
export function last(arr) {
  return arr[arr.length - 1];
}`,
  },
];
