import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepararApp } from './helpers';

let t: Awaited<ReturnType<typeof prepararApp>>;
let info: any;
beforeAll(async () => {
  t = await prepararApp();
  info = (await t.http().get('/api/publico/salon-ejemplo').expect(200)).body;
});
afterAll(() => t.cerrar());

const reserva = (extra: Record<string, unknown> = {}) => ({
  servicioId: info.servicios.find((s: any) => s.nombre === 'Corte de caballero').id,
  estilistaId: info.estilistas.find((e: any) => e.nombre.startsWith('Andrés')).id,
  inicio: `${t.fecha}T10:00:00-05:00`,
  nombre: 'Valentina Prueba',
  telefono: '300 111 2233',
  consentimiento: true,
  ...extra,
});

describe('salud y salón público', () => {
  it('responde /api/health', async () => {
    expect((await t.http().get('/api/health').expect(200)).body.ok).toBe(true);
  });
  it('muestra servicios y estilistas del salón por su slug', () => {
    expect(info.salon.nombre).toBe('Salón Ejemplo');
    expect(info.servicios).toHaveLength(6);
    expect(info.estilistas).toHaveLength(3);
  });
  it('404 si el slug no existe', async () => {
    await t.http().get('/api/publico/no-existe').expect(404);
  });
});

describe('reservas públicas', () => {
  it('exige consentimiento de la Ley 1581', async () => {
    const r = await t
      .http()
      .post('/api/publico/salon-ejemplo/reservas')
      .send(reserva({ consentimiento: false }))
      .expect(400);
    expect(r.body.errores[0].campo).toBe('consentimiento');
  });
  it('valida el celular colombiano', async () => {
    await t
      .http()
      .post('/api/publico/salon-ejemplo/reservas')
      .send(reserva({ telefono: '123' }))
      .expect(400);
  });
  it('reserva, crea abono pendiente y quita el cupo de la disponibilidad', async () => {
    const r = await t
      .http()
      .post('/api/publico/salon-ejemplo/reservas')
      .send(reserva({ abonar: true }))
      .expect(201);
    expect(r.body.cita.hora).toBe('10:00');
    expect(r.body.cita.codigo).toMatch(/^[A-Z0-9]{6}$/);
    expect(r.body.abono).toMatchObject({ monto: 5000, estado: 'pendiente' });
    const d = await t
      .http()
      .get('/api/publico/salon-ejemplo/disponibilidad')
      .query({
        servicioId: reserva().servicioId,
        estilistaId: reserva().estilistaId,
        fecha: t.fecha,
      })
      .expect(200);
    const horas = d.body.cupos.map((c: any) => c.hora);
    expect(horas).toContain('09:30');
    expect(horas).not.toContain('10:00');
  });
  it('rechaza un choque de horario con 409', async () => {
    await t
      .http()
      .post('/api/publico/salon-ejemplo/reservas')
      .send(reserva({ inicio: `${t.fecha}T10:00:00-05:00`, telefono: '3009998877' }))
      .expect(409);
  });
  it('rechaza dos reservas simultáneas al mismo cupo (solo una gana)', async () => {
    const cuerpo = (tel: string) => reserva({ inicio: `${t.fecha}T15:00:00-05:00`, telefono: tel });
    const rs = await Promise.all(
      ['3001000001', '3001000002', '3001000003'].map((tel) =>
        t.http().post('/api/publico/salon-ejemplo/reservas').send(cuerpo(tel)),
      ),
    );
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409]);
  });
  it('rechaza horas fuera del horario de la estilista', async () => {
    await t
      .http()
      .post('/api/publico/salon-ejemplo/reservas')
      .send(reserva({ inicio: `${t.fecha}T19:00:00-05:00` }))
      .expect(400);
  });
  it('no deja reservar un servicio de otro salón', async () => {
    const otro = (await t.http().get('/api/publico/otro-salon').expect(200)).body;
    await t
      .http()
      .post('/api/publico/salon-ejemplo/reservas')
      .send(reserva({ servicioId: otro.servicios[0].id }))
      .expect(404);
  });
  it('anota en la lista de espera', async () => {
    await t
      .http()
      .post('/api/publico/salon-ejemplo/espera')
      .send({ nombre: 'Camila', telefono: '3005556677', consentimiento: true })
      .expect(201);
  });
});

describe('login, roles y aislamiento', () => {
  it('rechaza contraseña incorrecta', async () => {
    await t
      .http()
      .post('/api/auth/login')
      .send({ email: 'duena@salon-ejemplo.ejemplo.co', password: 'mala' })
      .expect(401);
  });
  it('sin token no hay panel', async () => {
    await t.http().get('/api/salon/agenda').expect(401);
  });
  it('la dueña ve la agenda de su salón y no la del otro', async () => {
    const token = await t.login('duena@salon-ejemplo.ejemplo.co');
    const a = await t
      .http()
      .get('/api/salon/agenda')
      .query({ fecha: t.fecha })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(a.body.citas.length).toBeGreaterThanOrEqual(5);
    const otro = await t.login('duena@otro-salon.ejemplo.co');
    const ajena = a.body.citas[0].id;
    await t
      .http()
      .patch(`/api/salon/citas/${ajena}`)
      .set('Authorization', `Bearer ${otro}`)
      .send({ estado: 'cancelada' })
      .expect(404);
  });
  it('la estilista solo ve sus citas y no puede cerrar caja', async () => {
    const token = await t.login('yuli@salon-ejemplo.ejemplo.co');
    const a = await t
      .http()
      .get('/api/salon/agenda')
      .query({ fecha: t.fecha })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(new Set(a.body.citas.map((c: any) => c.estilistaId)).size).toBe(1);
    await t
      .http()
      .post('/api/salon/caja/cierre')
      .set('Authorization', `Bearer ${token}`)
      .send({ fecha: t.fecha })
      .expect(403);
  });
});

describe('pagos y cuadre de caja', () => {
  it('confirma el abono, atiende la cita y la suma al cuadre sin duplicar', async () => {
    const token = await t.login('duena@salon-ejemplo.ejemplo.co');
    const auth = { Authorization: `Bearer ${token}` };
    const ag = (await t.http().get('/api/salon/agenda').query({ fecha: t.fecha }).set(auth)).body
      .citas;
    const c = ag.find((x: any) => x.hora === '10:00');
    expect(c.abonoPendienteId).toBeTruthy();
    await t.http().post(`/api/salon/pagos/${c.abonoPendienteId}/confirmar`).set(auth).expect(200);
    const antes = (
      await t.http().get('/api/salon/caja').query({ fecha: t.fecha }).set(auth)
    ).body.estilistas.find((e: any) => e.estilistaId === c.estilistaId);
    for (let i = 0; i < 2; i++) {
      await t
        .http()
        .patch(`/api/salon/citas/${c.id}`)
        .set(auth)
        .send({ estado: 'atendida', medio: 'efectivo', propina: 1000 })
        .expect(200);
    }
    const caja = (
      await t.http().post('/api/salon/caja/cierre').set(auth).send({ fecha: t.fecha }).expect(201)
    ).body;
    const fila = caja.estilistas.find((e: any) => e.estilistaId === c.estilistaId);
    expect(fila.servicios).toBe(antes.servicios + 1);
    expect(fila.ventas - antes.ventas).toBe(15000);
    expect(fila.nequi - antes.nequi).toBe(5000);
    expect(fila.efectivo - antes.efectivo).toBe(11000);
    expect(fila.propinas - antes.propinas).toBe(1000);
    expect(caja.cerrado).toBe(true);
  });
});

describe('Ley 1581: borrar datos', () => {
  it('la clienta borra sus datos con celular y código; la cita queda anónima', async () => {
    const r = await t
      .http()
      .post('/api/publico/salon-ejemplo/reservas')
      .send(
        reserva({
          inicio: `${t.fecha}T16:00:00-05:00`,
          telefono: '3104445566',
          nombre: 'Borrar Prueba',
        }),
      )
      .expect(201);
    await t
      .http()
      .delete('/api/publico/salon-ejemplo/mis-datos')
      .send({ telefono: '3104445566', codigo: 'ZZZZZZ' })
      .expect(404);
    await t
      .http()
      .delete('/api/publico/salon-ejemplo/mis-datos')
      .send({ telefono: '3104445566', codigo: r.body.cita.codigo })
      .expect(204);
    const token = await t.login('duena@salon-ejemplo.ejemplo.co');
    const ag = (
      await t
        .http()
        .get('/api/salon/agenda')
        .query({ fecha: t.fecha })
        .set('Authorization', `Bearer ${token}`)
    ).body.citas;
    const c = ag.find((x: any) => x.hora === '16:00');
    expect(c.clienta).toBe('Clienta (datos borrados)');
    expect(c.telefono).toBeNull();
  });
  it('la dueña puede borrar una clienta de su salón', async () => {
    const token = await t.login('duena@salon-ejemplo.ejemplo.co');
    const auth = { Authorization: `Bearer ${token}` };
    const esp = (await t.http().get('/api/salon/espera').set(auth).expect(200)).body;
    const id = esp[0].clientaId;
    await t.http().get(`/api/salon/clientas/${id}`).set(auth).expect(200);
    await t.http().delete(`/api/salon/clientas/${id}`).set(auth).expect(204);
    await t.http().get(`/api/salon/clientas/${id}`).set(auth).expect(404);
  });
});
