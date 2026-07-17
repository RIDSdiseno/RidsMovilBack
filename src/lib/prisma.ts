import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  ridsMovilPrisma?: PrismaClient;
};

export const prisma = globalForPrisma.ridsMovilPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.ridsMovilPrisma = prisma;
}
