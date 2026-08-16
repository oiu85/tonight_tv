export type PublicSupabaseConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

type PublicSupabaseEnvironment = Readonly<{
  url?: string;
  publishableKey?: string;
}>;

const REQUIRED_VARIABLES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

export function validatePublicSupabaseConfig(
  environment: PublicSupabaseEnvironment,
): PublicSupabaseConfig {
  const missingVariables: string[] = [];

  if (!environment.url?.trim()) {
    missingVariables.push(REQUIRED_VARIABLES[0]);
  }

  if (!environment.publishableKey?.trim()) {
    missingVariables.push(REQUIRED_VARIABLES[1]);
  }

  if (missingVariables.length > 0) {
    throw new SupabaseConfigurationError(
      `Missing required public Supabase configuration: ${missingVariables.join(", ")}.`,
    );
  }

  const url = environment.url!.trim();
  const publishableKey = environment.publishableKey!.trim();

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new SupabaseConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP(S) URL.",
    );
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new SupabaseConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP(S) URL.",
    );
  }

  if (
    publishableKey.startsWith("sb_secret_") ||
    publishableKey.toLowerCase().includes("service_role")
  ) {
    throw new SupabaseConfigurationError(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must contain a browser-safe publishable key, not a privileged key.",
    );
  }

  return Object.freeze({ url: parsedUrl.toString().replace(/\/$/, ""), publishableKey });
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  return validatePublicSupabaseConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
