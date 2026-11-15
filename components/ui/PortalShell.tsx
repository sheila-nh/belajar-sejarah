import { Montserrat } from "next/font/google";
import type { ReactNode } from "react";
import { SideNav, TopNavMobile, type NavItem } from "@/components/ui/PortalNav";
import { MotifBottomLeft, MotifTopRight, NAVY } from "@/components/ui/HistoryDecor";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

const ic = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Ikon menu bersama (dipakai layout guru & siswa). */
export const NavIcons = {
  home: (
    <svg {...ic}>
      <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
    </svg>
  ),
  pdf: (
    <svg {...ic}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <text x="7.3" y="17" fontSize="5.2" fontWeight="700" fill="currentColor" stroke="none">PDF</text>
    </svg>
  ),
  doc: (
    <svg {...ic}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 12h6M9 16h6" />
    </svg>
  ),
  question: (
    <svg {...ic}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.4" />
      <circle cx="12" cy="17" r=".6" fill="currentColor" />
    </svg>
  ),
  book: (
    <svg {...ic}>
      <path d="M12 6C9.5 4 6 4 3 5v14c3-1 6.5-1 9 1 2.5-2 6-2 9-1V5c-3-1-6.5-1-9 1z" />
      <path d="M12 6v14" />
    </svg>
  ),
  logout: (
    <svg {...ic}>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M15 8l4 4-4 4M19 12H9" />
    </svg>
  ),
};

/**
 * Kerangka halaman setelah login (guru & siswa) — mengikuti Contoh UI/Menu admin (guru).jpeg:
 * sidebar krem bergaris kanan biru tua + motif, bilah atas biru tua dengan avatar.
 */
export default function PortalShell({
  subtitle,
  items,
  userName,
  avatar,
  logout,
  children,
}: {
  subtitle: string;
  items: NavItem[];
  userName: string;
  avatar: ReactNode;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <div className={`${montserrat.className} flex min-h-screen bg-[#f6f4ef]`}>
      <aside className="relative hidden w-64 shrink-0 flex-col overflow-hidden border-r-4 border-[#1d2b4f] bg-[#f6f4ef] md:flex">
        <div className="relative z-10 px-4 pb-8 pt-8 text-center">
          <h2 className="text-lg font-extrabold leading-tight tracking-wide" style={{ color: NAVY }}>
            BELAJAR SEJARAH
            <br />
            INDONESIA
          </h2>
          <p className="mt-1 text-xs font-medium text-gray-500">{subtitle}</p>
        </div>
        <div className="relative z-10 flex-1 px-4">
          <SideNav items={items} />
          <hr className="my-4 border-gray-300" />
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium text-[#1d2b4f] transition hover:bg-[#1d2b4f]/[0.07]"
            >
              {NavIcons.logout}
              Keluar
            </button>
          </form>
        </div>
        <MotifBottomLeft className="pointer-events-none absolute -bottom-8 -left-8 w-[210px] opacity-90" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between gap-4 bg-[#1d2b4f] px-4 text-white md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <TopNavMobile items={items} />
            <p className="hidden truncate text-sm text-white/80 md:block">
              Selamat datang, <span className="font-semibold text-white">{userName}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white">{avatar}</span>
            <span className="max-w-[10rem] truncate text-[15px] font-medium">{userName}</span>
            <form action={logout} className="md:hidden">
              <button type="submit" className="rounded-lg p-2 text-white/80 hover:bg-white/10" aria-label="Keluar">
                {NavIcons.logout}
              </button>
            </form>
          </div>
        </header>

        <main className="relative flex-1 overflow-auto px-4 py-8 md:px-8">
          <MotifTopRight className="pointer-events-none absolute -right-4 -top-2 hidden w-[230px] opacity-80 lg:block" />
          <div className="relative">{children}</div>
        </main>
      </div>
    </div>
  );
}
