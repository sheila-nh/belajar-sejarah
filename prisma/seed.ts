import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: "admin@sejarah.id" } });
  if (existing) {
    console.log("Admin sudah ada, skip seed.");
    return;
  }

  const hashed = await bcrypt.hash("admin123", 12);
  await prisma.user.create({
    data: {
      name: "Admin",
      email: "admin@sejarah.id",
      password: hashed,
      role: "ADMIN",
    },
  });

  console.log("Seed berhasil: admin@sejarah.id / admin123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
