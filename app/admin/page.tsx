import type { Metadata } from "next";
import { AdminHomeClient } from "@/components/admin/admin-home-client";

export const metadata: Metadata = { title: "Your Rooms" };
export default function AdminPage() { return <AdminHomeClient />; }
