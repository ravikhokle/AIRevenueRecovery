"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    section: "Overview",
    items: [{ href: "/dashboard", label: "Overview", icon: GridIcon }],
  },
  {
    section: "Recovery Operations",
    items: [
      { href: "/dashboard/transactions", label: "Transactions", icon: ListIcon },
      { href: "/dashboard/batch", label: "Batch Recovery", icon: PlayIcon },
    ],
  },
  {
    section: "Governance & Audit",
    items: [{ href: "/dashboard/audit", label: "Audit Trail", icon: ShieldIcon }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Link href="/dashboard" className="sidebar-logo-mark">
          <span className="brand-icon" aria-hidden="true">
            <SparkIcon />
          </span>
          RecoverAI
        </Link>
        <div className="sidebar-logo-sub">Revenue recovery operations</div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map((group) => (
          <div key={group.section} className="mb-2">
            <div className="sidebar-section">{group.section}</div>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-link${active ? " active" : ""}`}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-status flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-medium">Gateway</span>
          <span className="badge badge-amber font-mono">TEST MODE</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="pulse-dot" />
          <span className="text-[11px] text-emerald-400 font-semibold">
            AI Agent Ready
          </span>
        </div>
      </div>
    </aside>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.8 1.5a.75.75 0 0 0-1.4 0L8.1 5.2a3.3 3.3 0 0 1-2 2L2.4 8.6a.75.75 0 0 0 0 1.4l3.7 1.3a3.3 3.3 0 0 1 2 2l1.3 3.7a.75.75 0 0 0 1.4 0l1.3-3.7a3.3 3.3 0 0 1 2-2l3.7-1.3a.75.75 0 0 0 0-1.4l-3.7-1.3a3.3 3.3 0 0 1-2-2L10.8 1.5Z" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}
