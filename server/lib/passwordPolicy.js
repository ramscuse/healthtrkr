// Shared password-policy guard. Returns an error string when the password is
// rejected, or null when it passes. Centralised so register, password change,
// password reset, and admin-set all enforce the same rule.

const MIN_LENGTH = 8;
const MAX_LENGTH = 200;

export function validatePassword(password) {
  if (typeof password !== 'string') {
    return 'Password must be a string';
  }
  if (password.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters`;
  }
  if (password.length > MAX_LENGTH) {
    return `Password must be at most ${MAX_LENGTH} characters`;
  }
  if (password.trim().length === 0) {
    return 'Password cannot be only whitespace';
  }
  return null;
}
