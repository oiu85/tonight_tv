/**
 * Tiny class-name joiner. Filters falsy values, joins the rest with a space.
 *
 * Use this everywhere we need to compose class names. We deliberately keep
 * this trivial — no extra deps, no overrides — so the bundle stays small
 * and the call sites stay readable.
 */
export function cx(
  ...classes: Array<string | false | null | undefined | 0>
): string {
  return classes.filter(Boolean).join(" ");
}
