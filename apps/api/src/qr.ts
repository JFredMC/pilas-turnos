import type { salones } from './db/schema';

type Salon = typeof salones.$inferSelect;
export const QR_MAX_BYTES = 300 * 1024;
export const QR_TIPOS = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Quita los bytes del QR de cualquier respuesta JSON y deja solo si existe y su versión. */
export function sinQr(s: Salon) {
  const { nequiQr, nequiQrTipo: _t, nequiQrActualizado, ...resto } = s;
  return {
    ...resto,
    tieneQr: !!nequiQr,
    qrVersion: nequiQrActualizado ? nequiQrActualizado.getTime() : null,
  };
}

/** Detecta el tipo real por los primeros bytes (no confía en el Content-Type). */
export function tipoImagen(b: Buffer): (typeof QR_TIPOS)[number] | null {
  if (
    b.length > 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length > 12 &&
    b.subarray(0, 4).toString('ascii') === 'RIFF' &&
    b.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  return null;
}
