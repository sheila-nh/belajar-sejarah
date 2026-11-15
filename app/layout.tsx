import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Belajar Sejarah",
  description: "Platform belajar sejarah berbasis AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={geist.className}>
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
