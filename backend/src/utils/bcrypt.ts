import bcrypt from 'bcryptjs';

const SALT_ROUNUNDS = 10;

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, SALT_ROUNUNDS);
}

export function comparePassword(plain: string, hash: string): boolean {
  if (!hash) return false;
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}
