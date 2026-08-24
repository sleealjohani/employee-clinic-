import { authenticator } from "otplib";
import QRCode from "qrcode";

// One step of tolerance either side: clinic wall clocks drift.
authenticator.options = { window: 1 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpUri(username: string, secret: string): string {
  return authenticator.keyuri(username, "Employee Clinic — Al Hadeethah", secret);
}

export async function totpQrDataUrl(username: string, secret: string): Promise<string> {
  return QRCode.toDataURL(totpUri(username, secret), { margin: 1, width: 240 });
}

export function verifyTotp(token: string, secret: string): boolean {
  const cleaned = token.replace(/\D/g, "");
  if (cleaned.length !== 6) return false;
  try {
    return authenticator.verify({ token: cleaned, secret });
  } catch {
    return false;
  }
}
