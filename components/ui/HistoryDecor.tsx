/* Palet, motif geometris, dan ilustrasi bertema sejarah — dipakai halaman login/register dan panel guru
   (mengikuti Contoh UI/contoh login.jpeg & Menu admin (guru).jpeg). */

export const NAVY = "#1d2b4f";
export const BLUE = "#3577b5";
export const ORANGE = "#f47a20";
export const GOLD = "#fcc76a";
export const CREAM = "#f6f4ef";
export const MOTIF = "#c8cfde";

type Svg = { className?: string };

export function MotifTopRight({ className = "" }: Svg) {
  return (
    <svg className={className} viewBox="0 0 230 270" aria-hidden>
      <g fill="none" stroke={MOTIF} strokeWidth="9" strokeLinejoin="round">
        <path d="M150 10 205 65 150 120 95 65Z" />
        <path d="M150 38 177 65 150 92 123 65Z" fill={MOTIF} stroke="none" />
        <path d="M55 120 100 165 55 210 10 165Z" />
        <path d="M55 145 75 165 55 185 35 165Z" fill={MOTIF} stroke="none" />
        <path d="M40 10 70 40M10 40 40 70" />
      </g>
      <path
        d="M165 140c15 0 22 15 22 15s14-2 18 10c-10 4-12 16-12 16s-14-4-28 0c0 0-2-12-12-16 4-12 18-10 18-10s0-15-6-15Z"
        fill={GOLD}
      />
      <circle cx="175" cy="168" r="6" fill="#fff" />
      <circle cx="160" cy="232" r="9" fill="none" stroke={MOTIF} strokeWidth="5" />
      <path d="M70 70c0-8 10-14 10-14s10 6 10 14-5 12-10 12-10-4-10-12Z" fill={GOLD} opacity=".8" />
    </svg>
  );
}

export function MotifBottomLeft({ className = "" }: Svg) {
  return (
    <svg className={className} viewBox="0 0 240 340" aria-hidden>
      <g fill="none" stroke={MOTIF} strokeWidth="9" strokeLinejoin="round">
        <path d="M60 20 110 70 60 120 10 70Z" />
        <path d="M60 48 82 70 60 92 38 70Z" fill={MOTIF} stroke="none" />
        <rect x="18" y="140" width="90" height="90" rx="22" />
        <rect x="42" y="164" width="42" height="42" rx="10" />
        <path d="M10 270 60 320M110 270 60 320" />
        <circle cx="60" cy="295" r="7" fill={MOTIF} stroke="none" />
      </g>
      <circle cx="145" cy="22" r="13" fill={GOLD} />
      <circle cx="210" cy="80" r="11" fill="none" stroke={MOTIF} strokeWidth="5" />
      <path d="M130 120h110v110H130z" fill={GOLD} opacity=".85" />
      <path d="M185 135l40 40-40 40-40-40z" fill="#fff" opacity=".9" />
      <path d="M185 155l20 20-20 20-20-20z" fill={GOLD} />
      <path d="M150 250c20 0 35 20 35 20s15-20 35-20c0 25-20 45-35 60-15-15-35-35-35-60Z" fill={GOLD} opacity=".85" />
    </svg>
  );
}

export function Candi({ className = "", size = 70 }: Svg & { size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 70 70" aria-hidden>
      <g fill={NAVY}>
        <path d="M35 4l3 8h-6z" />
        <path d="M29 12h12l3 8H26z" />
        <path d="M24 20h22l3 9H21z" />
        <path d="M18 29h34v4H18z" />
        <path d="M20 33h30v22H20z" />
        <path d="M10 42h8v13h-8zM52 42h8v13h-8z" />
        <path d="M7 38l7-6 7 6zM49 38l7-6 7 6z" />
        <path d="M4 55h62v6H4z" />
      </g>
      <path d="M30 55V44a5 5 0 0 1 10 0v11z" fill={CREAM} />
      <path d="M24 37h22" stroke={CREAM} strokeWidth="1.5" />
    </svg>
  );
}

export function BookOrange({ className = "", size = 62 }: Svg & { size?: number }) {
  return (
    <svg className={className} width={size} height={(size * 72) / 62} viewBox="0 0 62 72" aria-hidden>
      <path d="M10 6h40a4 4 0 0 1 4 4v50H14a4 4 0 0 1-4-4z" fill={ORANGE} stroke={NAVY} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M10 56a4 4 0 0 1 4-4h40v12H14a4 4 0 0 1-4-4z" fill="#fff8ec" stroke={NAVY} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M8 8v52" stroke={NAVY} strokeWidth="5" strokeLinecap="round" />
      <path d="M40 16c-6 6-10 16-10 22l2 2c6-2 14-12 16-24z" fill={NAVY} />
      <path d="M18 64v8l4-3 4 3v-8" fill="#c0392b" stroke={NAVY} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function BookBrown({ className = "", size = 66 }: Svg & { size?: number }) {
  return (
    <svg className={className} width={size} height={(size * 78) / 66} viewBox="0 0 66 78" aria-hidden>
      <path d="M8 6h44a5 5 0 0 1 5 5v52H13a5 5 0 0 1-5-5z" fill="#9a5b2e" stroke={NAVY} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M8 58a5 5 0 0 1 5-5h44v13H13a5 5 0 0 1-5-5z" fill="#fff8ec" stroke={NAVY} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="20" y="16" width="26" height="12" rx="4" fill="#d9a066" stroke={NAVY} strokeWidth="2" />
      <path d="M14 20h4M14 34h4M14 44h4" stroke="#6e3d1c" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 66v10l5-4 5 4V66" fill={BLUE} stroke={NAVY} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function Compass({ className = "", size = 72 }: Svg & { size?: number }) {
  return (
    <svg className={className} width={size} height={(size * 88) / 72} viewBox="0 0 72 88" aria-hidden>
      <circle cx="36" cy="8" r="5" fill="none" stroke={NAVY} strokeWidth="2.5" />
      <rect x="30" y="12" width="12" height="7" rx="2" fill="#e0a64a" stroke={NAVY} strokeWidth="2" />
      <circle cx="36" cy="52" r="32" fill="#e0a64a" stroke={NAVY} strokeWidth="2.5" />
      <circle cx="36" cy="52" r="25" fill="#fff8ec" stroke={NAVY} strokeWidth="2" />
      <path d="M48 40 39 55 33 49z" fill={ORANGE} stroke={NAVY} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M24 64l9-15 6 6z" fill={BLUE} stroke={NAVY} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M36 30v4M36 70v4M14 52h4M54 52h4" stroke={NAVY} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Figur guru sederhana (kartu statistik & avatar). */
export function TeacherFigure({ className = "", size = 44 }: Svg & { size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 44 44" aria-hidden>
      <path d="M6 44c0-9 7-14 16-14s16 5 16 14z" fill={NAVY} />
      <path d="M18 30l4 6 4-6z" fill="#fff" />
      <path d="M21.2 33h1.6l.8 8h-3.2z" fill={ORANGE} />
      <rect x="18.5" y="24" width="7" height="7" rx="2" fill="#f2c9a5" />
      <circle cx="22" cy="17" r="9" fill="#f6d2b1" stroke={NAVY} strokeWidth="1.5" />
      <path d="M13 16c0-6 4-9 9-9s9 3 9 8c-3-2-6-3-9-3s-6 1-9 4z" fill={NAVY} />
      <circle cx="18.5" cy="18" r="1" fill={NAVY} />
      <circle cx="25.5" cy="18" r="1" fill={NAVY} />
    </svg>
  );
}

/** Figur siswa berseragam putih-abu (avatar portal siswa). */
export function StudentFigure({ className = "", size = 44 }: Svg & { size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 44 44" aria-hidden>
      <path d="M6 44c0-9 7-14 16-14s16 5 16 14z" fill="#f4f4f4" stroke={NAVY} strokeWidth="1.5" />
      <path d="M17 30l5 5 5-5" fill="none" stroke={NAVY} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M21 34h2l1 2-2 6-2-6z" fill="#8a8f99" />
      <rect x="18.5" y="24" width="7" height="7" rx="2" fill="#f2c9a5" />
      <circle cx="22" cy="17" r="9" fill="#f6d2b1" stroke={NAVY} strokeWidth="1.5" />
      <path d="M13 17c-1-7 4-10 9-10 6 0 10 4 9 10-2-3-5-5-9-5-4 0-7 2-9 5z" fill="#3b2a20" />
      <circle cx="18.5" cy="18.5" r="1" fill={NAVY} />
      <circle cx="25.5" cy="18.5" r="1" fill={NAVY} />
      <path d="M19.5 22c1.5 1.2 3.5 1.2 5 0" fill="none" stroke={NAVY} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
