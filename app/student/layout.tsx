import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import PortalShell, { NavIcons } from "@/components/ui/PortalShell";
import { StudentFigure } from "@/components/ui/HistoryDecor";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user as { role: string; name: string } | undefined;
  if (!user || user.role !== "PELAJAR") redirect("/login");

  const logout = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <PortalShell
      subtitle="Portal Siswa"
      userName={user.name}
      avatar={<StudentFigure size={40} />}
      logout={logout}
      items={[
        { href: "/student/dashboard", label: "Dashboard", icon: NavIcons.home },
        { href: "/student/materials", label: "Materi & Soal", icon: NavIcons.book },
      ]}
    >
      {children}
    </PortalShell>
  );
}
