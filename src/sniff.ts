/** Cheap header byte-sniffs to classify files before decoding. */

const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'heif'];

/** ISOBMFF ftyp-brand sniff for HEIC/HEIF (browsers can't decode these natively). */
export async function isHeicFile(file: File): Promise<boolean> {
  if (/\.(heic|heif)$/i.test(file.name)) return true;
  if (/^image\/(heic|heif)/i.test(file.type)) return true;
  try {
    const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const ftyp = String.fromCharCode(b[4], b[5], b[6], b[7]);
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    return ftyp === 'ftyp' && HEIC_BRANDS.includes(brand);
  } catch {
    return false;
  }
}

/** Header sniff for animated GIF / WebP / APNG. */
export async function isAnimated(file: File): Promise<boolean> {
  try {
    const buf = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    if (s.startsWith('GIF8')) return s.includes('NETSCAPE2.0');
    if (s.startsWith('RIFF') && s.slice(8, 12) === 'WEBP') return s.includes('ANIM');
    if (buf[0] === 0x89 && s.slice(1, 4) === 'PNG') return s.includes('acTL');
    return false;
  } catch {
    return false;
  }
}
