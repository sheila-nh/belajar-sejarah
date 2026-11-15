import { prisma } from "@/lib/db";
import GenerateLessonPlanForm from "@/components/admin/GenerateLessonPlanForm";
import Link from "next/link";

export default async function GenerateLessonPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ materialId?: string }>;
}) {
  const { materialId } = await searchParams;

  const materials = await prisma.material.findMany({
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      _count: { select: { chunks: true } },
    },
  });

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/lesson-plans" className="text-gray-400 hover:text-gray-600">←</Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Generate Lesson Plan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Qwen akan memecah materi PDF menjadi lesson yang mudah dipelajari</p>
        </div>
      </div>
      <GenerateLessonPlanForm materials={materials} defaultMaterialId={materialId} />
    </div>
  );
}
