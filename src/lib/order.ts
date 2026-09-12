/**
 * Fractional index keys (PLAN.md section 6).
 *
 * Ordering is a string rather than an integer so that dropping a stop between
 * two others is a single-row write that two offline phones can both make
 * without renumbering anything. A key is read as the fraction `0.<key>` in
 * base 36, so "m" < "n" and there is always room between any two keys.
 */

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length;

const valueAt = (key: string, i: number): number => {
  const ch = key[i];
  return ch === undefined ? 0 : DIGITS.indexOf(ch);
};

/**
 * A key that sorts strictly between `before` and `after`. Either end may be
 * null, meaning "nothing that side" — so `orderKeyBetween(last, null)` is how
 * a stop gets appended to a day.
 */
export function orderKeyBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) {
    throw new Error(`order keys out of sequence: ${before} >= ${after}`);
  }
  // "0", "00" and friends are the fraction zero, so nothing sorts below them.
  // Nothing this module generates looks like that; a caller passing one in has
  // a corrupt key and should hear about it rather than hang.
  if (after !== null && /^0+$/.test(after)) {
    throw new Error(`no key sorts below ${after}`);
  }

  let out = "";
  for (let i = 0; ; i++) {
    const lo = before === null ? 0 : valueAt(before, i);
    // A null upper bound is the fraction 1.0, whose digits are all "z" + 1.
    const hi = after === null ? BASE : valueAt(after, i);

    if (hi - lo > 1) {
      // Room for a digit strictly between the two.
      return out + DIGITS[Math.floor((lo + hi) / 2)];
    }

    // No room at this digit: keep the lower bound's digit and look deeper.
    out += DIGITS[lo];

    if (hi - lo === 1) {
      // The bounds diverge here, so anything further only has to beat `before`.
      return out + orderKeyBetween(before === null ? null : before.slice(i + 1), null);
    }
  }
}

/** The key for appending after every key in `existing`. */
export function orderKeyAppend(existing: readonly string[]): string {
  const last = existing.length === 0 ? null : [...existing].sort().at(-1) ?? null;
  return orderKeyBetween(last, null);
}
