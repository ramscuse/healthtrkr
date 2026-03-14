import 'dotenv/config';
import bcrypt from 'bcrypt';
import prisma from '../lib/prisma.js';

const [email, newPassword] = process.argv.slice(2);

if (!email || !newPassword) {
  console.error('Usage: node db/reset-password.js <email> <new-password>');
  process.exit(1);
}

if (newPassword.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

const hashed = await bcrypt.hash(newPassword, 12);
await prisma.user.update({ where: { email }, data: { password: hashed } });

console.log(`Password reset for ${email}`);
await prisma.$disconnect();
