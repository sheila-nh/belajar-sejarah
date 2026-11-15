import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import PortalShell, { NavIcons } from "@/components/ui/PortalShell";
import { TeacherFigure } from "@/components/ui/HistoryDecor";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user as { role: string; name: string } | undefined;
  if (!user || user.role !== "ADMIN") redirect("/login");

  const logout = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <PortalShell
      subtitle="Panel Guru"
      userName={user.name}
      avatar={<TeacherFigure size={40} />}
      logout={logout}
      items={[
        { href: "/admin/dashboard", label: "Dashboard", icon: NavIcons.home },
        { href: "/admin/materials", label: "Materi (PDF)", icon: NavIcons.pdf },
        { href: "/admin/lesson-plans", label: "Lesson Plans", icon: NavIcons.doc },
        { href: "/admin/questions", label: "Soal Latihan", icon: NavIcons.question },
      ]}
    >
      {children}
    </PortalShell>
  );
}
