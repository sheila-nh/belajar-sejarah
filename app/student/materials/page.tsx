import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getStudentProgress } from "@/lib/studentProgress";
import MaterialProgressCard from "@/components/student/MaterialProgressCard";
import { NAVY } from "@/components/ui/HistoryDecor";

export default async function StudentMaterialsPage() {
  const session = await auth();
  const user = session?.user as { id: string } | undefined;
  if (!user) redirect("/login");

  const progress = await getStudentProgress(user.id);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold sm:text-[1.75rem]" style={{ color: NAVY }}>
        Materi Sejarah
      </h1>
      <p className="mb-7 text-sm text-gray-600">
        Baca setiap lesson, kerjakan quiz-nya, lalu taklukkan challenge di akhir materi.
      </p>

      {progress.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-gray-300 bg-white py-16 text-center text-sm text-gray-500">
          Belum ada materi yang tersedia. Tunggu guru mengunggah materi.
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {progress.map((m, i) => (
            <MaterialProgressCard key={m.id} m={m} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
