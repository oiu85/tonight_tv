import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  createAuthService,
  isAnonymousUser,
} from "../../src/lib/auth/auth-service";

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-08-17T00:00:00.000Z",
    ...overrides,
  } as User;
}

function createSession(user: User): Session {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    expires_at: 1_800_000_000,
    token_type: "bearer",
    user,
  };
}

function createClientMock(options?: {
  session?: Session | null;
  sessionError?: Error | null;
  verifiedUser?: User | null;
  userError?: Error | null;
  anonymousSession?: Session | null;
  anonymousUser?: User | null;
  anonymousError?: Error | null;
  adminSession?: Session | null;
  adminUser?: User | null;
  adminError?: Error | null;
  signOutError?: Error | null;
}) {
  const auth = {
    getSession: vi.fn().mockResolvedValue({
      data: { session: options?.session ?? null },
      error: options?.sessionError ?? null,
    }),
    getUser: vi.fn().mockResolvedValue({
      data: { user: options?.verifiedUser ?? null },
      error: options?.userError ?? null,
    }),
    signInAnonymously: vi.fn().mockResolvedValue({
      data: {
        session: options?.anonymousSession ?? null,
        user: options?.anonymousUser ?? null,
      },
      error: options?.anonymousError ?? null,
    }),
    signInWithPassword: vi.fn().mockResolvedValue({
      data: {
        session: options?.adminSession ?? null,
        user: options?.adminUser ?? null,
      },
      error: options?.adminError ?? null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: options?.signOutError ?? null }),
  };

  return { client: { auth } as unknown as SupabaseClient, auth };
}

describe("Auth service", () => {
  it("reuses an existing verified session without anonymous sign-in", async () => {
    const user = createUser();
    const session = createSession(user);
    const { client, auth } = createClientMock({ session, verifiedUser: user });

    const identity = await createAuthService(client).ensureViewerIdentity();

    expect(identity).toEqual({ user, session, source: "existing-session" });
    expect(auth.getUser).toHaveBeenCalledOnce();
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously only when no session exists", async () => {
    const anonymousUser = createUser({ is_anonymous: true });
    const anonymousSession = createSession(anonymousUser);
    const { client, auth } = createClientMock({
      anonymousSession,
      anonymousUser,
    });
    const service = createAuthService(client);

    const [first, second] = await Promise.all([
      service.ensureViewerIdentity(),
      service.ensureViewerIdentity(),
    ]);

    expect(first).toEqual(second);
    expect(first.source).toBe("anonymous-sign-in");
    expect(auth.getSession).toHaveBeenCalledOnce();
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
    expect(isAnonymousUser(first.user)).toBe(true);
  });

  it("does not hide session lookup failures behind a new anonymous user", async () => {
    const { client, auth } = createClientMock({
      sessionError: new Error("storage unavailable"),
    });

    await expect(createAuthService(client).ensureViewerIdentity()).rejects.toMatchObject({
      code: "session_lookup_failed",
    });
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("propagates anonymous sign-in failures as a stable Auth error", async () => {
    const { client } = createClientMock({
      anonymousError: new Error("anonymous sign-in disabled"),
    });

    await expect(createAuthService(client).ensureViewerIdentity()).rejects.toMatchObject({
      code: "anonymous_sign_in_failed",
    });
  });

  it("signs a persistent administrator in through normal Supabase Auth", async () => {
    const admin = createUser({ email: "admin@example.test", is_anonymous: false });
    const session = createSession(admin);
    const { client, auth } = createClientMock({
      adminSession: session,
      adminUser: admin,
    });

    const identity = await createAuthService(client).signInAdmin({
      email: "admin@example.test",
      password: "test-password",
    });

    expect(identity).toEqual({ user: admin, session, source: "existing-session" });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "admin@example.test",
      password: "test-password",
    });
    expect(isAnonymousUser(identity.user)).toBe(false);
  });

  it("surfaces sign-out failures through the same Auth error boundary", async () => {
    const { client } = createClientMock({ signOutError: new Error("network error") });

    await expect(createAuthService(client).signOut()).rejects.toMatchObject({
      code: "sign_out_failed",
    });
  });
});
