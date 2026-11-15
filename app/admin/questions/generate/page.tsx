import { prisma } from "@/lib/db";
import GenerateForm from "@/components/admin/GenerateForm";

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ materialId?: string }>;
}) {
  const { materialId } = await searchParams;
  const materials = await prisma.material.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Generate Soal dengan AI</h1>
      <GenerateForm materials={materials} defaultMaterialId={materialId} />
    </div>
  );
}
