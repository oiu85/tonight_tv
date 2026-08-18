import type { Metadata } from "next";
import { AdminHomeClient } from "@/components/admin/admin-home-client";
import { getMessages, getServerLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: getMessages(locale).admin.metaTitle };
}

export default function AdminPage() { return <AdminHomeClient />; }
