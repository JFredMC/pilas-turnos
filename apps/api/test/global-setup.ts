import { migrar } from '../src/db/migrate';

export const URL_TEST =
  process.env['DATABASE_URL_TEST'] ?? 'postgres://pilas:pilas@localhost:5432/pilas_test';

export default async function setup() {
  await migrar(URL_TEST);
}
