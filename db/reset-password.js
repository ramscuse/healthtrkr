import "dotenv/config";
import bcrypt from "bcrypt";
import prisma from "../lib/prisma.js";
import { validatePassword, SALT_ROUNDS } from "../server/lib/passwordPolicy.js";

const [email, newPassword] = process.argv.slice(2);

if (!email || !newPassword) {
  console.error("Usage: node db/reset-password.js <email> <new-password>");
  process.exit(1);
}

const passwordError = validatePassword(newPassword);
if (passwordError) {
  console.error(passwordError);
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
// Bump tokenVersion (kills existing sessions) and burn outstanding reset codes,
// same as the admin set-password route.
await prisma.$transaction([
  prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, tokenVersion: { increment: 1 } },
  }),
  prisma.passwordResetToken.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  }),
]);

console.log(`Password reset for ${email}`);
await prisma.$disconnect();
