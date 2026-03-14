import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed complete — no seed data required for Phase 1.');
  // Workout template is hardcoded in the route handler.
  // Add user seeds here if needed for local dev.
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
