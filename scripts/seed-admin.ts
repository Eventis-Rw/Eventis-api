import { PrismaClient } from "@prisma/client";

import { bootstrapAdmin } from "../src/modules/identity/infrastructure/admin-bootstrap.js";

const email = process.env.ADMIN_SEED_EMAIL;
const password = process.env.ADMIN_SEED_PASSWORD;
if (!email || !password)
  throw new Error(
    "Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD in the backend environment before running db:seed:admin.",
  );
const prisma = new PrismaClient();
try {
  const result = await bootstrapAdmin(prisma, {
    email,
    password,
    ...(process.env.ADMIN_SEED_NAME
      ? { name: process.env.ADMIN_SEED_NAME }
      : {}),
    rotatePassword: process.env.ADMIN_SEED_ROTATE_PASSWORD === "true",
  });
  console.warn(`Admin seed ${result.outcome}. Credentials were not printed.`);
} finally {
  await prisma.$disconnect();
}
