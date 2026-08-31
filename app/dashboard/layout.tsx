import type { Metadata } from "next";
import { Sidebar } from "@/app/components/Sidebar";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-shell">
      <Sidebar />
      <div className="main-content">{children}</div>
    </div>
  );
}
