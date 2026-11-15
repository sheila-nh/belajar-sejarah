import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePDF } from "@/lib/pdf";
import { indexMaterial } from "@/lib/rag";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const materials = await prisma.material.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      filename: true,
      createdAt: true,
      _count: { select: { questions: true } },
    },
  });

  return NextResponse.json(materials);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { role: string; name: string } | undefined;
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const title = formData.get("title") as string;
  const file = formData.get("file") as File;

  if (!title || !file) {
    return NextResponse.json({ error: "Title dan file wajib diisi" }, { status: 400 });
  }

  const uploadsDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const filename = `${uuidv4()}.pdf`;
  const filePath = path.join(uploadsDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const material = await prisma.material.create({
    data: {
      title,
      filename: file.name,
      filePath,
      uploadedBy: user.name || "Admin",
    },
  });

  // Indeks RAG (potongan teks bersih + embedding) untuk umpan balik kuis berbasis buku
  try {
    const text = await parsePDF(filePath);
    const count = await indexMaterial(material.id, text);
    console.log(`[materials] "${title}": ${count} potongan diindeks`);
  } catch (err) {
    console.error("PDF processing error:", err);
  }

  return NextResponse.json(material, { status: 201 });
}
