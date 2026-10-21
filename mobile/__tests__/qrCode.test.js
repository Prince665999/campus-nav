import { parseQrCode } from '@/utils/qrCode';

describe('parseQrCode', () => {
  test('reads the app link', () => {
    expect(parseQrCode('campusnav://qr/LIB-G-02')).toBe('LIB-G-02');
  });

  test('reads a web link, ignoring query and fragment', () => {
    expect(parseQrCode('https://campus.example.ac.tz/q/LIB-G-02?x=1#top')).toBe(
      'LIB-G-02'
    );
  });

  test('reads a bare code and trims spaces and slashes', () => {
    expect(parseQrCode('  LIB-G-02  ')).toBe('LIB-G-02');
    expect(parseQrCode('campusnav://qr/LIB_G_02/')).toBe('LIB_G_02');
  });

  test('rejects things that are not codes', () => {
    expect(parseQrCode('')).toBeNull();
    expect(parseQrCode(null)).toBeNull();
    expect(parseQrCode(undefined)).toBeNull();
    expect(parseQrCode('two words')).toBeNull();
    expect(parseQrCode('A'.repeat(33))).toBeNull();
    expect(parseQrCode('hello world!')).toBeNull();
  });
});
