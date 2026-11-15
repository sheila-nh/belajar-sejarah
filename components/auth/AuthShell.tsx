import { Montserrat } from "next/font/google";
import type { ReactNode } from "react";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["500", "600", "700", "800"] });

export type AuthRole = "GURU" | "SISWA";

import { NAVY, BLUE, ORANGE, MotifTopRight, MotifBottomLeft, Candi, BookOrange, BookBrown, Compass } from "@/components/ui/HistoryDecor";

/* Palet mengikuti contoh desain (Contoh UI/contoh login.jpeg). */
export { NAVY, BLUE, ORANGE };

export default function AuthShell({
  role,
  onRoleChange,
  children,
}: {
  role: AuthRole;
  onRoleChange: (r: AuthRole) => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`${montserrat.className} relative min-h-screen overflow-hidden bg-[#f6f4ef] px-4 py-10 sm:py-16`}
    >
      <Decorations />

      <div className="relative z-10 mx-auto flex w-full max-w-[390px] flex-col items-center">
        <h1
          className="mb-8 text-center text-3xl font-extrabold leading-tight tracking-wide sm:text-[2.1rem]"
          style={{ color: NAVY }}
        >
          BELAJAR SEJARAH
          <br />
          INDONESIA
        </h1>

        {/* Pilihan peran */}
        <div className="mb-4 grid w-full grid-cols-2 gap-4" role="tablist" aria-label="Pilih peran">
          <RoleCard active={role === "GURU"} onClick={() => onRoleChange("GURU")} variant="guru" />
          <RoleCard active={role === "SISWA"} onClick={() => onRoleChange("SISWA")} variant="siswa" />
        </div>

        <div className="w-full rounded-2xl bg-white px-7 py-8 shadow-[0_8px_30px_rgba(29,43,79,0.10)] sm:px-8">
          {children}
        </div>
      </div>
    </div>
  );
}

function RoleCard({
  active,
  onClick,
  variant,
}: {
  active: boolean;
  onClick: () => void;
  variant: "guru" | "siswa";
}) {
  const isGuru = variant === "guru";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative h-[96px] overflow-hidden rounded-xl text-center shadow-[0_6px_18px_rgba(29,43,79,0.10)] transition duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#3577b5]/30 ${
        active ? "-translate-y-0.5 ring-2 ring-[#3577b5] ring-offset-2 ring-offset-[#f6f4ef]" : "opacity-80 hover:opacity-100"
      }`}
      style={{ background: active ? BLUE : "#ffffff" }}
    >
      {/* sudut dekoratif */}
      <span
        aria-hidden
        className="absolute -left-5 -top-5 h-12 w-12 rounded-full"
        style={{ background: NAVY }}
      />
      <span
        aria-hidden
        className="absolute -bottom-6 -right-6 h-[60px] w-[60px] rounded-full"
        style={{ background: ORANGE }}
      />

      {isGuru ? (
        <span aria-hidden className="absolute bottom-1.5 right-1.5">
          <CapIcon />
        </span>
      ) : (
        <>
          <span aria-hidden className="absolute left-6 top-2.5 rotate-[-35deg]">
            <PencilIcon />
          </span>
          <span aria-hidden className="absolute right-3 top-2 text-[13px]" style={{ color: active ? "#fde7c4" : ORANGE }}>
            ✦
          </span>
          <span aria-hidden className="absolute bottom-1.5 right-1.5">
            <OpenBookIcon />
          </span>
        </>
      )}

      <span className="relative block leading-tight" style={{ color: active ? "#ffffff" : NAVY }}>
        <span className="block text-xl font-bold">{isGuru ? "GURU" : "SISWA"}</span>
        {isGuru && <span className="block text-sm font-semibold">(ADMIN)</span>}
      </span>
    </button>
  );
}

/* ---------- Input bergaris bawah dengan ikon ---------- */

export function UnderlineField({
  icon,
  trailing,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode; trailing?: ReactNode }) {
  return (
    <label className="group flex items-center gap-3 border-b-2 border-gray-200 pb-2 pt-1 transition-colors focus-within:border-[#3577b5]">
      <span className="text-gray-400 transition-colors group-focus-within:text-[#3577b5]">{icon}</span>
      <input
        {...props}
        className="w-full bg-transparent text-[15px] text-[#1d2b4f] placeholder:text-gray-400 focus:outline-none"
      />
      {trailing}
    </label>
  );
}

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full rounded-full py-3 text-base font-bold tracking-wider text-white shadow-[0_6px_14px_rgba(53,119,181,0.35)] transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
      style={{ background: BLUE }}
    >
      {children}
    </button>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
      {children}
    </div>
  );
}

/* ---------- Ikon ---------- */

const ic = { width: 20, height: 20, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const UserIcon = () => (
  <svg viewBox="0 0 24 24" {...ic}><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
);
export const MailIcon = () => (
  <svg viewBox="0 0 24 24" {...ic}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></svg>
);
export const LockIcon = () => (
  <svg viewBox="0 0 24 24" {...ic}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" /></svg>
);
export function EyeToggle({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-gray-400 hover:text-[#3577b5]"
      aria-label={shown ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
    >
      {shown ? (
        <svg viewBox="0 0 24 24" {...ic}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" {...ic}><path d="M3 3l18 18" /><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.4-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
      )}
    </button>
  );
}

function PencilIcon() {
  return (
    <svg width="34" height="12" viewBox="0 0 34 12">
      <rect x="6" y="2" width="22" height="8" rx="1" fill={ORANGE} stroke={NAVY} strokeWidth="1.3" />
      <path d="M28 2l5 4-5 4z" fill="#f6d9b8" stroke={NAVY} strokeWidth="1.3" strokeLinejoin="round" />
      <rect x="1" y="2" width="5" height="8" rx="1.5" fill="#f2b6b6" stroke={NAVY} strokeWidth="1.3" />
    </svg>
  );
}
function OpenBookIcon() {
  return (
    <svg width="38" height="30" viewBox="0 0 38 30">
      <path d="M19 6C14 2 7 2 2 4v22c5-2 12-2 17 2 5-4 12-4 17-2V4c-5-2-12-2-17 2Z" fill="#fff8ec" stroke={NAVY} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M19 6v22M6 9h9M6 13h9M6 17h7M23 9h9M23 13h9M23 17h7" stroke={NAVY} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function CapIcon() {
  return (
    <svg width="36" height="28" viewBox="0 0 36 28">
      <path d="M18 3 2 10l16 7 16-7z" fill="#fff8ec" stroke={NAVY} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 13v6c3 3 17 3 20 0v-6" fill="#fff8ec" stroke={NAVY} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M32 11v8" stroke={NAVY} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Hiasan latar: motif geometris + ilustrasi sejarah ---------- */

function Decorations() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
      <MotifTopRight className="absolute -right-6 -top-6 w-[150px] opacity-70 sm:w-[230px] sm:opacity-100" />
      <MotifBottomLeft className="absolute -bottom-6 -left-6 w-[150px] opacity-70 sm:w-[240px] sm:opacity-100" />

      {/* ilustrasi (layar sedang ke atas) */}
      <div className="absolute inset-0 hidden md:block">
        <div className="absolute left-1/2 top-1/2 h-0 w-0">
          <Candi className="absolute -left-[300px] -top-[115px]" />
          <BookOrange className="absolute left-[240px] -top-[160px] rotate-[8deg]" />
          <BookBrown className="absolute -left-[305px] top-[135px] rotate-[-12deg]" />
          <Compass className="absolute left-[185px] top-[195px]" />
          <svg className="absolute left-[255px] top-[95px]" width="30" height="30" viewBox="0 0 30 30">
            <circle cx="15" cy="15" r="10" fill="none" stroke={ORANGE} strokeWidth="5" />
          </svg>
        </div>
      </div>
    </div>
  );
}
