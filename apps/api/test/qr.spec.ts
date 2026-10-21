import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepararApp } from './helpers';

// PNG mínimo válido de 1×1.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

let t: Awaited<ReturnType<typeof prepararApp>>;
let duena: Record<string, string>;
beforeAll(async () => {
  t = await prepararApp();
  duena = { Authorization: `Bearer ${await t.login('duena@salon-ejemplo.ejemplo.co')}` };
});
afterAll(() => t.cerrar());

describe('QR de Nequi Negocios', () => {
  it('sin QR, el enlace público no lo ofrece', async () => {
    expect((await t.http().get('/api/publico/salon-ejemplo')).body.salon.qrVersion).toBeNull();
    await t.http().get('/api/publico/salon-ejemplo/qr').expect(404);
  });

  it('rechaza archivos que no son imagen o que pesan mucho', async () => {
    await t
      .http()
      .put('/api/config/salon/qr')
      .set(duena)
      .set('Content-Type', 'image/png')
      .send(Buffer.from('<script>no</script>'))
      .expect(400);
    await t
      .http()
      .put('/api/config/salon/qr')
      .set(duena)
      .set('Content-Type', 'image/png')
      .send(Buffer.concat([PNG, Buffer.alloc(310 * 1024)]))
      .expect(400);
  });

  it('la estilista no puede subirlo', async () => {
    const yuli = await t.login('yuli@salon-ejemplo.ejemplo.co');
    await t
      .http()
      .put('/api/config/salon/qr')
      .set('Authorization', `Bearer ${yuli}`)
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(403);
  });

  it('la dueña sube el QR, se sirve en público y no sale en el JSON', async () => {
    const r = await t
      .http()
      .put('/api/config/salon/qr')
      .set(duena)
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(200);
    expect(r.body.tieneQr).toBe(true);
    expect(r.body.nequiQr).toBeUndefined();
    const pub = (await t.http().get('/api/publico/salon-ejemplo')).body.salon;
    expect(pub.qrVersion).toEqual(expect.any(Number));
    const img = await t.http().get('/api/publico/salon-ejemplo/qr').buffer(true).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(img.body as Buffer, PNG)).toBe(0);
    expect(JSON.stringify((await t.http().get('/api/salon').set(duena)).body)).not.toContain(
      'nequiQr"',
    );
    // Sin abono activo, no se muestra
    await t.http().patch('/api/config/salon').set(duena).send({ abonoActivo: false }).expect(200);
    await t.http().get('/api/publico/salon-ejemplo/qr').expect(404);
    await t.http().patch('/api/config/salon').set(duena).send({ abonoActivo: true }).expect(200);
    expect(
      (await t.http().delete('/api/config/salon/qr').set(duena).expect(200)).body.tieneQr,
    ).toBe(false);
  });
});
