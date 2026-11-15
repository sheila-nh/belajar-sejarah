import { prisma } from "@/lib/db";
import Link from "next/link";
import MaterialOrderList from "@/components/admin/MaterialOrderList";

export default async function MaterialsPage() {
  const materials = await prisma.material.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { questions: true, chunks: true } } },
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Materi PDF</h1>
          {materials.length > 1 && (
            <p className="text-xs text-gray-400 mt-0.5">
              Gunakan tombol ↑↓ untuk mengatur urutan tampilan materi.
            </p>
          )}
        </div>
        <Link
          href="/admin/materials/upload"
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition text-sm"
        >
          + Upload Materi
        </Link>
      </div>

      {materials.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">Belum ada materi.</p>
          <Link href="/admin/materials/upload" className="text-amber-600 hover:underline mt-2 inline-block">
            Upload materi pertama →
          </Link>
        </div>
      ) : (
        <MaterialOrderList initialMaterials={materials} />
      )}
    </div>
  );
}
