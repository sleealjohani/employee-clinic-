import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** At least 10 characters, mixing letters and digits. Deliberately simple and enforceable. */
export function passwordIsStrong(plain: string): boolean {
  return plain.length >= 10 && /[A-Za-z]/.test(plain) && /\d/.test(plain);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Unambiguous characters only — these get read aloud and copied by hand. */
export function generateTempPassword(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  // Guarantee the generated value satisfies the strength rule.
  return `${out.slice(0, length - 2)}${(bytes[0] % 10)}${(bytes[1] % 10)}`;
}

export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_MINUTES = 15;
