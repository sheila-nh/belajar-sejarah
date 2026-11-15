"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell, {
  type AuthRole,
  UnderlineField,
  PrimaryButton,
  ErrorBox,
  EyeToggle,
  MailIcon,
  LockIcon,
  NAVY,
  BLUE,
} from "@/components/auth/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<AuthRole>("SISWA");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    const res = await signIn("credentials", { email, password, redirect: false });

    if (res?.error) {
      setError("Email atau kata sandi salah");
      setLoading(false);
    } else {
      // Tujuan ditentukan oleh peran akun yang tersimpan, bukan kartu yang dipilih.
      const meRes = await fetch("/api/auth/session");
      const session = await meRes.json();
      const userRole = session?.user?.role;
      router.push(userRole === "ADMIN" ? "/admin/dashboard" : "/student/dashboard");
    }
  }

  return (
    <AuthShell role={role} onRoleChange={setRole}>
      <h2 className="mb-1 text-center text-2xl font-bold" style={{ color: NAVY }}>
        Masuk
      </h2>
      <p className="mb-7 text-center text-sm text-gray-500">
        {role === "GURU" ? "sebagai Guru (Admin)" : "sebagai Siswa"}
      </p>

      {error && <ErrorBox>{error}</ErrorBox>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <UnderlineField
          icon={<MailIcon />}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          aria-label="Email"
        />
        <UnderlineField
          icon={<LockIcon />}
          name="password"
          type={showPw ? "text" : "password"}
          required
          autoComplete="current-password"
          placeholder="Kata Sandi"
          aria-label="Kata sandi"
          trailing={<EyeToggle shown={showPw} onClick={() => setShowPw((v) => !v)} />}
        />
        <div className="pt-2">
          <PrimaryButton type="submit" disabled={loading}>
            {loading ? "MEMPROSES…" : "MASUK"}
          </PrimaryButton>
        </div>
      </form>

      <div className="mt-6 space-y-2 text-center text-sm" style={{ color: NAVY }}>
        <button type="button" onClick={() => setShowForgot((v) => !v)} className="hover:underline">
          Lupa kata sandi?
        </button>
        {showForgot && (
          <p className="rounded-lg bg-[#f6f4ef] px-3 py-2 text-xs text-gray-600">
            {role === "GURU"
              ? "Hubungi pengelola aplikasi untuk mengatur ulang kata sandi akun guru."
              : "Hubungi guru Anda untuk mengatur ulang kata sandi."}
          </p>
        )}
        {role === "SISWA" ? (
          <p>
            Belum punya akun?{" "}
            <Link href="/register" className="font-bold hover:underline" style={{ color: BLUE }}>
              Daftar
            </Link>
          </p>
        ) : (
          <p className="text-xs text-gray-500">Akun guru dibuat oleh pengelola aplikasi.</p>
        )}
      </div>
    </AuthShell>
  );
}
