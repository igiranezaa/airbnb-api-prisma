import "dotenv/config";
import prisma from "../src/config/prisma";
import bcrypt from "bcrypt";

async function main() {
  const hashed = await bcrypt.hash("Admin123!", 10);
  const user = await prisma.user.update({
    where: { email: "admin@test.com" },
    data: { password: hashed, loginAttempts: 0, lockedUntil: null },
  });
  console.log(`✅ Password reset for ${user.email} (role: ${user.role})`);
  console.log("   New credentials: admin@test.com / Admin123!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
