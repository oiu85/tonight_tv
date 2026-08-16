import type { JwtPayload, User } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "../supabase/server";

export type VerifiedServerAuth = Readonly<{
  claims: JwtPayload;
  user: User;
}>;

/**
 * Returns a server-verified identity. Cookie-loaded getSession() data is never
 * used as an authorization decision.
 */
export async function getVerifiedServerAuth(): Promise<VerifiedServerAuth | null> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    return null;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return null;
  }

  return { claims: claimsData.claims, user: userData.user };
}
