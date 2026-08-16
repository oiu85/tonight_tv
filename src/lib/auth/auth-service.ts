import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "../supabase/browser";
import type { Database } from "../supabase/database.types";

export type AuthState =
  | Readonly<{ status: "unauthenticated"; session: null; user: null }>
  | Readonly<{ status: "authenticated"; session: Session; user: User }>;

export type ViewerIdentity = Readonly<{
  session: Session;
  user: User;
  source: "existing-session" | "anonymous-sign-in";
}>;

export type AdminCredentials = Readonly<{
  email: string;
  password: string;
}>;

export type AuthServiceErrorCode =
  | "session_lookup_failed"
  | "user_verification_failed"
  | "anonymous_sign_in_failed"
  | "admin_sign_in_failed"
  | "sign_out_failed"
  | "invalid_auth_response";

export class AuthServiceError extends Error {
  readonly code: AuthServiceErrorCode;

  constructor(code: AuthServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuthServiceError";
    this.code = code;
  }
}

export type AuthService = Readonly<{
  getCurrentAuth: () => Promise<AuthState>;
  ensureViewerIdentity: () => Promise<ViewerIdentity>;
  signInAdmin: (credentials: AdminCredentials) => Promise<ViewerIdentity>;
  signOut: () => Promise<void>;
}>;

function invalidAuthResponse(operation: string): AuthServiceError {
  return new AuthServiceError(
    "invalid_auth_response",
    `Supabase Auth returned no user or session after ${operation}.`,
  );
}

/** Uses Supabase's supported flag rather than nickname/email heuristics. */
export function isAnonymousUser(user: User): boolean {
  return user.is_anonymous === true;
}

export function createAuthService(client: SupabaseClient<Database>): AuthService {
  let pendingViewerIdentity: Promise<ViewerIdentity> | undefined;

  async function getCurrentAuth(): Promise<AuthState> {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();

    if (sessionError) {
      throw new AuthServiceError(
        "session_lookup_failed",
        "Unable to read the current authentication session.",
        { cause: sessionError },
      );
    }

    if (!sessionData.session) {
      return { status: "unauthenticated", session: null, user: null };
    }

    const { data: userData, error: userError } = await client.auth.getUser();

    if (userError) {
      throw new AuthServiceError(
        "user_verification_failed",
        "Unable to verify the current authenticated user.",
        { cause: userError },
      );
    }

    if (!userData.user) {
      throw invalidAuthResponse("session verification");
    }

    return {
      status: "authenticated",
      session: sessionData.session,
      user: userData.user,
    };
  }

  async function resolveViewerIdentity(): Promise<ViewerIdentity> {
    const current = await getCurrentAuth();

    if (current.status === "authenticated") {
      return {
        session: current.session,
        user: current.user,
        source: "existing-session",
      };
    }

    const { data, error } = await client.auth.signInAnonymously();

    if (error) {
      throw new AuthServiceError(
        "anonymous_sign_in_failed",
        "Unable to create an anonymous viewer identity.",
        { cause: error },
      );
    }

    if (!data.session || !data.user) {
      throw invalidAuthResponse("anonymous sign-in");
    }

    return { session: data.session, user: data.user, source: "anonymous-sign-in" };
  }

  async function ensureViewerIdentity(): Promise<ViewerIdentity> {
    pendingViewerIdentity ??= resolveViewerIdentity().finally(() => {
      pendingViewerIdentity = undefined;
    });

    return pendingViewerIdentity;
  }

  async function signInAdmin(credentials: AdminCredentials): Promise<ViewerIdentity> {
    const { data, error } = await client.auth.signInWithPassword(credentials);

    if (error) {
      throw new AuthServiceError(
        "admin_sign_in_failed",
        "Unable to sign in to the administrator account.",
        { cause: error },
      );
    }

    if (!data.session || !data.user) {
      throw invalidAuthResponse("administrator sign-in");
    }

    return { session: data.session, user: data.user, source: "existing-session" };
  }

  async function signOut(): Promise<void> {
    const { error } = await client.auth.signOut();

    if (error) {
      throw new AuthServiceError("sign_out_failed", "Unable to sign out.", {
        cause: error,
      });
    }
  }

  return Object.freeze({
    getCurrentAuth,
    ensureViewerIdentity,
    signInAdmin,
    signOut,
  });
}

let browserAuthService: AuthService | undefined;

export function getBrowserAuthService(): AuthService {
  browserAuthService ??= createAuthService(createBrowserSupabaseClient());
  return browserAuthService;
}
