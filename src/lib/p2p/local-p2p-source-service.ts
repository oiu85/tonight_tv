"use client";

export {
  createLocalP2pSourceService,
  type LocalP2pSourceService,
} from "./application/source-service";

import { createBrowserSupabaseClient } from "../supabase/browser";
import { createLocalP2pSourceService, type LocalP2pSourceService } from "./application/source-service";
import { getBrowserLocalP2pRuntime } from "./infrastructure/webtorrent-runtime";

let browserSourceService: LocalP2pSourceService | null = null;

export function getBrowserLocalP2pSourceService(): LocalP2pSourceService {
  browserSourceService ??= createLocalP2pSourceService(
    createBrowserSupabaseClient(),
    getBrowserLocalP2pRuntime(),
  );
  return browserSourceService;
}

export function resetBrowserLocalP2pSourceService(): void {
  browserSourceService = null;
}
