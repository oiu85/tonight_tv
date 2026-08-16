import { describe, expect, it } from "vitest";

import {
  SupabaseConfigurationError,
  validatePublicSupabaseConfig,
} from "../../src/lib/supabase/config";

describe("public Supabase configuration", () => {
  it("returns a normalized browser-safe configuration", () => {
    expect(
      validatePublicSupabaseConfig({
        url: "https://project.supabase.co/",
        publishableKey: "sb_publishable_test",
      }),
    ).toEqual({
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_test",
    });
  });

  it("names missing variables without exposing values", () => {
    expect(() => validatePublicSupabaseConfig({})).toThrowError(
      new SupabaseConfigurationError(
        "Missing required public Supabase configuration: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      ),
    );
  });

  it("rejects a privileged key in the public-key variable", () => {
    expect(() =>
      validatePublicSupabaseConfig({
        url: "https://project.supabase.co",
        publishableKey: ["sb", "secret", "test-value"].join("_"),
      }),
    ).toThrowError(/browser-safe publishable key/);
  });
});
