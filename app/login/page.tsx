import type { Metadata } from "next";
import { LoginClient } from "@/components/auth/login-client";
import { getMessages, getServerLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: getMessages(locale).auth.metaTitle };
}

export default function LoginPage() { return <LoginClient />; }
