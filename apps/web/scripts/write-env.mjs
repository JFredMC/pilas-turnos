// Escribe src/app/core/entorno.ts desde variables de entorno antes de compilar.
// Sin PILAS_API_URL la app usa los datos de ejemplo (así sigue la vista previa de GitHub Pages).
import { writeFileSync } from 'node:fs';

const apiUrl = (process.env.PILAS_API_URL ?? '').trim().replace(/\/+$/, '');
const slug = (process.env.PILAS_SALON_SLUG ?? 'salon-ejemplo').trim();
if (apiUrl && !/^https?:\/\/[^\s"'`]+$/.test(apiUrl)) throw new Error('PILAS_API_URL inválida');
if (!/^[a-z0-9-]{3,60}$/.test(slug)) throw new Error('PILAS_SALON_SLUG inválido');

writeFileSync(
  new URL('../src/app/core/entorno.ts', import.meta.url),
  `// Archivo generado por scripts/write-env.mjs: no lo edites a mano.
export const ENTORNO = {
  /** URL de la API (sin /api). Vacía = modo de ejemplo sin backend. */
  apiUrl: ${JSON.stringify(apiUrl)},
  /** Salón por defecto del enlace de reservas. */
  salonSlug: ${JSON.stringify(slug)},
};
`,
);
console.log(apiUrl ? `API: ${apiUrl} · salón: ${slug}` : 'Sin PILAS_API_URL: modo de ejemplo.');
