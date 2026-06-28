// Shared password-policy guard. Returns an error string when the password is
// rejected, or null when it passes. Centralised so register, password change,
// password reset, and admin-set all enforce the same rule.

const MIN_LENGTH = 8;
// bcrypt only consumes the first 72 bytes of its input, so two distinct
// passwords that share their first 72 UTF-8 bytes hash identically. Cap the
// byte length to that boundary to avoid silent equivalence classes. We cap
// chars as a cheap fast-fail (200 chars * 4 bytes/char = 800 worst case,
// no point bcrypt-ing more than the byte check anyway) but the authoritative
// limit is the byte count.
const MAX_LENGTH = 200;
const MAX_BYTE_LENGTH = 72;

export function validatePassword(password) {
  if (typeof password !== "string") {
    return "Password must be a string";
  }
  if (password.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters`;
  }
  if (password.length > MAX_LENGTH) {
    return `Password must be at most ${MAX_LENGTH} characters`;
  }
  if (Buffer.byteLength(password, "utf8") > MAX_BYTE_LENGTH) {
    return `Password must be at most ${MAX_BYTE_LENGTH} bytes (UTF-8)`;
  }
  if (password.trim().length === 0) {
    return "Password cannot be only whitespace";
  }
  return null;
}
