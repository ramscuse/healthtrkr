import app from './app.js';
import prisma from '../lib/prisma.js';

// Fail loud at boot if required production envs are missing or weak. Better
// to crash on startup than to serve traffic with a broken signing key.
if (process.env.NODE_ENV === 'production') {
  const { JWT_SECRET, CORS_ORIGIN } = process.env;
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters in production');
  }
  if (!CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN must be set in production');
  }
}

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
