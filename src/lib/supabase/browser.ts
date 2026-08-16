"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicSupabaseConfig } from "./config";
import type { Database } from "./database.types";

let browserClient: SupabaseClient<Database> | undefined;

/**
 * Returns the one browser client used by Auth and future Database, Realtime,
 * Storage, and RPC integrations.
 */
export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (!browserClient) {
    const { url, publishableKey } = getPublicSupabaseConfig();
    browserClient = createBrowserClient<Database>(url, publishableKey);
  }

  return browserClient;
}
