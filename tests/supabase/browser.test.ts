import { createBrowserClient } from "@supabase/ssr";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(() => ({ auth: {} })),
}));

describe("browser Supabase client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  });

  it("creates one stable client for repeated consumers", async () => {
    const { createBrowserSupabaseClient } = await import(
      "../../src/lib/supabase/browser"
    );

    const first = createBrowserSupabaseClient();
    const second = createBrowserSupabaseClient();

    expect(first).toBe(second);
    expect(createBrowserClient).toHaveBeenCalledOnce();
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "sb_publishable_test",
    );
  });
});
