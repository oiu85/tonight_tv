import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

type CookieToSet = Readonly<{
  name: string;
  value: string;
  options?: { path?: string };
}>;

type CapturedServerOptions = Readonly<{
  cookies: {
    getAll: () => unknown[];
    setAll: (cookiesToSet: CookieToSet[], headers: Record<string, string>) => void;
  };
}>;

describe("server Supabase clients", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  });

  it("adapts the current Next.js cookie store using getAll/setAll", async () => {
    const existingCookies = [{ name: "sb-old", value: "old" }];
    const cookieStore = {
      getAll: vi.fn(() => existingCookies),
      set: vi.fn(),
    };
    vi.mocked(cookies).mockResolvedValue(cookieStore as never);

    let capturedOptions: CapturedServerOptions | undefined;
    const client = { auth: {} };
    vi.mocked(createServerClient).mockImplementation((_url, _key, options) => {
      capturedOptions = options as unknown as CapturedServerOptions;
      return client as never;
    });

    const { createServerSupabaseClient } = await import(
      "../../src/lib/supabase/server"
    );
    const result = await createServerSupabaseClient();

    expect(result).toBe(client);
    expect(capturedOptions?.cookies.getAll()).toEqual(existingCookies);

    capturedOptions?.cookies.setAll(
      [{ name: "sb-new", value: "new", options: { path: "/" } }],
      {},
    );
    expect(cookieStore.set).toHaveBeenCalledWith("sb-new", "new", { path: "/" });
  });

  it("copies refreshed cookies and cache headers onto the proxy response", async () => {
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: null }, error: null });

    vi.mocked(createServerClient).mockImplementation((_url, _key, options) => {
      const captured = options as unknown as CapturedServerOptions;
      captured.cookies.setAll(
        [{ name: "sb-session", value: "refreshed", options: { path: "/" } }],
        { "cache-control": "private, no-store" },
      );
      return { auth: { getClaims } } as never;
    });

    const { updateSupabaseSession } = await import(
      "../../src/lib/supabase/proxy"
    );
    const response = await updateSupabaseSession(
      new NextRequest("https://tonight.test/room"),
    );

    expect(getClaims).toHaveBeenCalledOnce();
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("verifies claims and the current user without trusting getSession on the server", async () => {
    const getClaims = vi.fn().mockResolvedValue({
      data: { claims: { sub: "user-1", role: "authenticated" } },
      error: null,
    });
    const user = { id: "user-1" };
    const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
    const getSession = vi.fn();

    vi.mocked(cookies).mockResolvedValue({ getAll: vi.fn(() => []), set: vi.fn() } as never);
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getClaims, getUser, getSession },
    } as never);

    const { getVerifiedServerAuth } = await import(
      "../../src/lib/auth/server-auth"
    );
    const verified = await getVerifiedServerAuth();

    expect(verified).toMatchObject({ claims: { sub: "user-1" }, user });
    expect(getClaims).toHaveBeenCalledOnce();
    expect(getUser).toHaveBeenCalledOnce();
    expect(getSession).not.toHaveBeenCalled();
  });
});
