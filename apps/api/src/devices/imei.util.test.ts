import { describe, expect, it } from 'vitest';
import { isValidImei, normalizeImei, imeiType } from './imei.util.js';

describe('IMEI validation', () => {
  it('normalizes non-digits', () => {
    expect(normalizeImei('35-6938-0356-4380-9')).toBe('356938035643809');
  });
  it('rejects wrong length', () => {
    expect(isValidImei('123')).toBe(false);
    expect(imeiType('123')).toBe('invalid_length');
  });
  it('rejects invalid checksum', () => {
    expect(isValidImei('356938035643800')).toBe(false);
  });
  it('accepts a valid IMEI', () => {
    // Known valid IMEI (Luhn)
    expect(isValidImei('490154203237518')).toBe(true);
    expect(imeiType('490154203237518')).toBe('valid');
  });
  it('handles empty', () => {
    expect(imeiType('')).toBe('empty');
  });
});
