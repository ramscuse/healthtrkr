// One password rule + bcrypt cost for register, change, reset, admin-set and
// the CLI reset script.

export const SALT_ROUNDS = 12;

const MIN_LENGTH = 8;
// bcrypt only reads the first 72 bytes, so longer passwords that share a
// 72-byte prefix would hash identically. Cap at the byte boundary.
const MAX_BYTE_LENGTH = 72;

// Returns an error string when rejected, null when it passes.
export function validatePassword(password) {
  if (typeof password !== "string") {
    return "Password must be a string";
  }
  if (password.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters`;
  }
  if (Buffer.byteLength(password, "utf8") > MAX_BYTE_LENGTH) {
    return `Password must be at most ${MAX_BYTE_LENGTH} bytes (UTF-8)`;
  }
  if (password.trim().length === 0) {
    return "Password cannot be only whitespace";
  }
  return null;
}
