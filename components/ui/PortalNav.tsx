"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type NavItem = { href: string; label: string; icon: ReactNode };

/** Navigasi samping (layar md ke atas). Item aktif = biru tua. */
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1.5">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium transition ${
              active ? "bg-[#1d2b4f] text-white shadow-md" : "text-[#1d2b4f] hover:bg-[#1d2b4f]/[0.07]"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Navigasi ringkas berikon di bilah atas (layar kecil). */
export function TopNavMobile({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:hidden">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-label={item.label}
            className={`rounded-lg p-2 ${active ? "bg-white text-[#1d2b4f]" : "text-white/80 hover:bg-white/10"}`}
          >
            {item.icon}
          </Link>
        );
      })}
    </nav>
  );
}
