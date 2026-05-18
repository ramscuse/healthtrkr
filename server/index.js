import app from './app.js';
import prisma from '../lib/prisma.js';

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`healthtrkr server running on port ${PORT}`);
});

// Graceful shutdown: finish in-flight requests, then disconnect Prisma
process.on('SIGTERM', () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
});
