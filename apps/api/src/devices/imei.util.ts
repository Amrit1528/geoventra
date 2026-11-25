/** GEOVENTRA — IMEI validation helpers. */

export function normalizeImei(input: string): string {
  return String(input ?? '').replace(/\D/g, '');
}

export function isValidImei(input: string): boolean {
  const digits = normalizeImei(input);
  if (!/^\d{15}$/.test(digits)) return false;
  // Luhn check (IMEI).
  let sum = 0;
  for (let i = 0; i < 15; i += 1) {
    let d = Number(digits[14 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function imeiType(input: string): 'valid' | 'invalid_length' | 'invalid_checksum' | 'empty' {
  const digits = normalizeImei(input);
  if (digits.length === 0) return 'empty';
  if (digits.length !== 15) return 'invalid_length';
  return isValidImei(digits) ? 'valid' : 'invalid_checksum';
}
