"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell, {
  type AuthRole,
  UnderlineField,
  PrimaryButton,
  ErrorBox,
  EyeToggle,
  UserIcon,
  MailIcon,
  LockIcon,
  NAVY,
  BLUE,
} from "@/components/auth/AuthShell";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<AuthRole>("SISWA");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (res.ok) {
      router.push("/login");
    } else {
      const data = await res.json();
      setError(data.error || "Terjadi kesalahan");
      setLoading(false);
    }
  }

  return (
    <AuthShell role={role} onRoleChange={setRole}>
      <h2 className="mb-1 text-center text-2xl font-bold" style={{ color: NAVY }}>
        Daftar
      </h2>

      {role === "GURU" ? (
        // Pendaftaran mandiri hanya untuk siswa (API membuat akun berperan PELAJAR).
        <div className="text-center">
          <p className="mb-7 text-sm text-gray-500">sebagai Guru (Admin)</p>
          <div className="mb-7 rounded-xl bg-[#f6f4ef] px-4 py-4 text-sm leading-relaxed text-gray-600">
            Akun guru tidak dapat didaftarkan sendiri. Silakan hubungi pengelola aplikasi untuk
            dibuatkan akun, lalu masuk dengan email dan kata sandi yang diberikan.
          </div>
          <Link
            href="/login"
            className="block w-full rounded-full py-3 text-base font-bold tracking-wider text-white shadow-[0_6px_14px_rgba(53,119,181,0.35)] transition hover:brightness-110"
            style={{ background: BLUE }}
          >
            KE HALAMAN MASUK
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-7 text-center text-sm text-gray-500">Buat akun siswa baru</p>

          {error && <ErrorBox>{error}</ErrorBox>}

          <form onSubmit={handleSubmit} className="space-y-6">
            <UnderlineField
              icon={<UserIcon />}
              name="name"
              type="text"
              required
              autoComplete="name"
              placeholder="Nama Lengkap"
              aria-label="Nama lengkap"
            />
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
              minLength={6}
              autoComplete="new-password"
              placeholder="Kata Sandi (minimal 6 karakter)"
              aria-label="Kata sandi"
              trailing={<EyeToggle shown={showPw} onClick={() => setShowPw((v) => !v)} />}
            />
            <div className="pt-2">
              <PrimaryButton type="submit" disabled={loading}>
                {loading ? "MENDAFTAR…" : "DAFTAR"}
              </PrimaryButton>
            </div>
          </form>
        </>
      )}

      <p className="mt-6 text-center text-sm" style={{ color: NAVY }}>
        Sudah punya akun?{" "}
        <Link href="/login" className="font-bold hover:underline" style={{ color: BLUE }}>
          Masuk
        </Link>
      </p>
    </AuthShell>
  );
}
