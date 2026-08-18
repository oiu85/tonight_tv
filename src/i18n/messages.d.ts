/**
 * Ambient module declarations so we can import JSON message bundles
 * directly with full type safety. next-intl reads these same files at
 * build time, so the shape stays in sync by construction.
 */
declare module "../../messages/en.json" {
  const value: import("./messages").MessageBundle;
  export default value;
}
declare module "../../messages/ar.json" {
  const value: import("./messages").MessageBundle;
  export default value;
}
