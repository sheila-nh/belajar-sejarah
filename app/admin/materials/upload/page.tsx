"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function UploadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const form = e.currentTarget;
    const formData = new FormData(form);

    const res = await fetch("/api/materials", { method: "POST", body: formData });

    if (res.ok) {
      setSuccess("Materi berhasil diupload dan sedang diproses embedding!");
      form.reset();
      setTimeout(() => router.push("/admin/materials"), 2000);
    } else {
      const text = await res.text();
      let message = "Terjadi kesalahan saat upload";
      try { message = JSON.parse(text).error || message; } catch { /* non-JSON response */ }
      setError(message);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/materials" className="text-gray-400 hover:text-gray-600">←</Link>
        <h1 className="text-2xl font-bold text-gray-800">Upload Materi PDF</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{success}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Judul Materi</label>
            <input
              name="title"
              type="text"
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Contoh: Perang Diponegoro 1825-1830"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File PDF</label>
            <input
              name="file"
              type="file"
              accept=".pdf"
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Format PDF, maksimal 20MB</p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {loading ? "Mengupload & memproses..." : "Upload Materi"}
          </button>
        </form>

        {loading && (
          <p className="text-xs text-gray-400 mt-3 text-center">
            Proses embedding PDF memerlukan waktu beberapa menit tergantung ukuran file...
          </p>
        )}
      </div>
    </div>
  );
}
