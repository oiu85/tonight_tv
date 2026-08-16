"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicSupabaseConfig } from "./config";

let browserClient: SupabaseClient | undefined;

/**
 * Returns the one browser client used by Auth and future Database, Realtime,
 * Storage, and RPC integrations. Prompt 2 will add the generated Database type.
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    const { url, publishableKey } = getPublicSupabaseConfig();
    browserClient = createBrowserClient(url, publishableKey);
  }

  return browserClient;
}
