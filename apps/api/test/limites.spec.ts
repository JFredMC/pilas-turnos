import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepararApp } from './helpers';

let t: Awaited<ReturnType<typeof prepararApp>>;
beforeAll(async () => {
  t = await prepararApp({ loginRpm: 3 });
});
afterAll(() => t.cerrar());

describe('seguridad HTTP', () => {
  it('limita los intentos de login (429)', async () => {
    const codigos: number[] = [];
    for (let i = 0; i < 5; i++) {
      codigos.push(
        (await t.http().post('/api/auth/login').send({ email: 'x@y.co', password: 'nada' })).status,
      );
    }
    expect(codigos.slice(0, 3)).toEqual([401, 401, 401]);
    expect(codigos.at(-1)).toBe(429);
  });
  it('CORS permite PUT (horario y QR) a los orígenes permitidos', async () => {
    const r = await t
      .http()
      .options('/api/config/salon/qr')
      .set('Origin', 'https://jfredmc.github.io')
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'content-type,authorization');
    expect(r.headers['access-control-allow-methods']).toContain('PUT');
  });
  it('CORS solo para orígenes permitidos', async () => {
    const ok = await t.http().get('/api/health').set('Origin', 'https://jfredmc.github.io');
    expect(ok.headers['access-control-allow-origin']).toBe('https://jfredmc.github.io');
    const no = await t.http().get('/api/health').set('Origin', 'https://malo.example');
    expect(no.headers['access-control-allow-origin']).toBeUndefined();
  });
});
