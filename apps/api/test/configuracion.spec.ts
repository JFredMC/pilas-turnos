import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CorreoService } from '../src/correo';
import { prepararApp } from './helpers';

let t: Awaited<ReturnType<typeof prepararApp>>;
let duena: Record<string, string>;
beforeAll(async () => {
  t = await prepararApp();
  duena = { Authorization: `Bearer ${await t.login('duena@salon-ejemplo.ejemplo.co')}` };
});
afterAll(() => t.cerrar());

describe('configuración del salón (solo dueña)', () => {
  it('la estilista no puede entrar a la configuración', async () => {
    const yuli = await t.login('yuli@salon-ejemplo.ejemplo.co');
    await t.http().get('/api/config/salon').set('Authorization', `Bearer ${yuli}`).expect(403);
  });

  it('edita datos del salón y valida el slug único', async () => {
    const r = await t
      .http()
      .patch('/api/config/salon')
      .set(duena)
      .send({
        nombre: 'Salón Brisas',
        whatsapp: '300 123 4567',
        nequiNumero: '3001234567',
        abonoActivo: true,
        abonoCop: 8000,
      })
      .expect(200);
    expect(r.body).toMatchObject({
      nombre: 'Salón Brisas',
      whatsapp: '3001234567',
      abonoCop: 8000,
    });
    await t.http().patch('/api/config/salon').set(duena).send({ slug: 'otro-salon' }).expect(409);
    await t.http().patch('/api/config/salon').set(duena).send({ slug: 'Con Espacios' }).expect(400);
    const pub = (await t.http().get('/api/publico/salon-ejemplo').expect(200)).body.salon;
    expect(pub).toMatchObject({ abonoCop: 8000, nequiNumero: '3001234567' });
    await t.http().patch('/api/config/salon').set(duena).send({ abonoActivo: false }).expect(200);
    expect((await t.http().get('/api/publico/salon-ejemplo')).body.salon.abonoCop).toBe(0);
  });

  it('CRUD de servicios: crea, edita y desactiva si tiene citas', async () => {
    const c = await t
      .http()
      .post('/api/config/servicios')
      .set(duena)
      .send({ nombre: 'Keratina', minutos: 90, precio: 120000 })
      .expect(201);
    await t
      .http()
      .patch(`/api/config/servicios/${c.body.id}`)
      .set(duena)
      .send({ precio: 110000 })
      .expect(200);
    expect(
      (await t.http().delete(`/api/config/servicios/${c.body.id}`).set(duena).expect(200)).body
        .resultado,
    ).toBe('borrado');
    await t
      .http()
      .post('/api/config/servicios')
      .set(duena)
      .send({ nombre: 'Malo', minutos: 7, precio: 1 })
      .expect(400);
    const lista = (await t.http().get('/api/config/servicios').set(duena)).body;
    const conCitas = lista.find((s: any) => s.nombre === 'Corte de dama');
    expect(
      (await t.http().delete(`/api/config/servicios/${conCitas.id}`).set(duena).expect(200)).body
        .resultado,
    ).toBe('desactivado');
    const pub = (await t.http().get('/api/publico/salon-ejemplo')).body.servicios;
    expect(pub.find((s: any) => s.nombre === 'Corte de dama')).toBeUndefined();
  });

  it('estilistas, horario semanal y excepciones cambian la disponibilidad', async () => {
    const e = (
      await t
        .http()
        .post('/api/config/estilistas')
        .set(duena)
        .send({ nombre: 'Nueva Estilista', comisionPct: 35 })
        .expect(201)
    ).body;
    await t
      .http()
      .put(`/api/config/estilistas/${e.id}/horario`)
      .set(duena)
      .send({
        franjas: [
          { diaSemana: 1, abre: '09:00', cierra: '12:00' },
          { diaSemana: 1, abre: '11:00', cierra: '13:00' },
        ],
      })
      .expect(400);
    await t
      .http()
      .put(`/api/config/estilistas/${e.id}/horario`)
      .set(duena)
      .send({
        franjas: [
          { diaSemana: 1, abre: '09:00', cierra: '11:00' },
          { diaSemana: 1, abre: '14:00', cierra: '15:00' },
        ],
      })
      .expect(200);
    const svc = (await t.http().get('/api/publico/salon-ejemplo')).body.servicios.find(
      (s: any) => s.minutos === 30,
    );
    const cupos = async () =>
      (
        await t
          .http()
          .get('/api/publico/salon-ejemplo/disponibilidad')
          .query({ servicioId: svc.id, estilistaId: e.id, fecha: t.fecha })
          .expect(200)
      ).body.cupos.map((c: any) => c.hora);
    expect(await cupos()).toEqual(['09:00', '09:30', '10:00', '10:30', '14:00', '14:30']);
    // Horario especial ese día
    const esp = (
      await t
        .http()
        .post('/api/config/excepciones')
        .set(duena)
        .send({ estilistaId: e.id, fecha: t.fecha, cerrado: false, abre: '16:00', cierra: '17:00' })
        .expect(201)
    ).body;
    expect(await cupos()).toEqual(['16:00', '16:30']);
    await t.http().delete(`/api/config/excepciones/${esp.id}`).set(duena).expect(204);
    // Festivo de todo el salón
    await t
      .http()
      .post('/api/config/excepciones')
      .set(duena)
      .send({ fecha: t.fecha, motivo: 'Festivo' })
      .expect(201);
    expect(await cupos()).toEqual([]);
    const lista = (
      await t.http().get('/api/config/excepciones').set(duena).query({ desde: t.fecha })
    ).body;
    expect(lista[0]).toMatchObject({ motivo: 'Festivo', cerrado: true, estilistaId: null });
    await t.http().delete(`/api/config/excepciones/${lista[0].id}`).set(duena).expect(204);
    // Inactiva: no aparece en el enlace público
    await t
      .http()
      .patch(`/api/config/estilistas/${e.id}`)
      .set(duena)
      .send({ activo: false, comisionPct: 40 })
      .expect(200);
    const pub = (await t.http().get('/api/publico/salon-ejemplo')).body.estilistas;
    expect(pub.find((x: any) => x.id === e.id)).toBeUndefined();
  });

  it('no deja tocar datos de otro salón', async () => {
    const otra = { Authorization: `Bearer ${await t.login('duena@otro-salon.ejemplo.co')}` };
    const mio = (await t.http().get('/api/config/servicios').set(duena)).body[0];
    await t
      .http()
      .patch(`/api/config/servicios/${mio.id}`)
      .set(otra)
      .send({ precio: 1 })
      .expect(404);
    await t.http().delete(`/api/config/servicios/${mio.id}`).set(otra).expect(404);
  });
});

describe('invitaciones y contraseñas', () => {
  it('invita a una estilista con contraseña temporal y la obliga a cambiarla', async () => {
    const est = (await t.http().get('/api/config/estilistas').set(duena)).body.find((e: any) =>
      e.nombre.startsWith('Kelly'),
    );
    const inv = (
      await t
        .http()
        .post('/api/config/usuarios')
        .set(duena)
        .send({ nombre: 'Kelly', email: 'Kelly@Ejemplo.co', estilistaId: est.id })
        .expect(201)
    ).body;
    expect(inv.passwordTemporal).toHaveLength(12);
    await t
      .http()
      .post('/api/config/usuarios')
      .set(duena)
      .send({ nombre: 'Kelly', email: 'kelly@ejemplo.co', estilistaId: est.id })
      .expect(409);
    const login = (
      await t
        .http()
        .post('/api/auth/login')
        .send({ email: 'kelly@ejemplo.co', password: inv.passwordTemporal })
        .expect(200)
    ).body;
    expect(login.usuario.debeCambiarPassword).toBe(true);
    const tmp = { Authorization: `Bearer ${login.token}` };
    const bloqueo = await t.http().get('/api/salon/agenda').set(tmp).expect(403);
    expect(bloqueo.body.codigo).toBe('CAMBIO_PASSWORD');
    await t
      .http()
      .post('/api/auth/cambiar-password')
      .set(tmp)
      .send({ actual: inv.passwordTemporal, nueva: 'corta' })
      .expect(400);
    const nuevo = (
      await t
        .http()
        .post('/api/auth/cambiar-password')
        .set(tmp)
        .send({ actual: inv.passwordTemporal, nueva: 'kelly-clave-nueva-1' })
        .expect(200)
    ).body;
    expect(nuevo.usuario.debeCambiarPassword).toBe(false);
    // El token viejo deja de servir; el nuevo sí entra y solo ve sus citas.
    await t.http().get('/api/auth/yo').set(tmp).expect(401);
    await t
      .http()
      .get('/api/salon/agenda')
      .set('Authorization', `Bearer ${nuevo.token}`)
      .expect(200);
    const equipo = (await t.http().get('/api/config/usuarios').set(duena)).body;
    expect(equipo.find((x: any) => x.email === 'kelly@ejemplo.co').debeCambiarPassword).toBe(false);
    expect(JSON.stringify(equipo)).not.toContain('passwordHash');
    // Restablecer por la dueña: nueva temporal y cierra sesiones
    const r = (
      await t.http().post(`/api/config/usuarios/${inv.id}/restablecer`).set(duena).expect(200)
    ).body;
    await t.http().get('/api/auth/yo').set('Authorization', `Bearer ${nuevo.token}`).expect(401);
    await t
      .http()
      .post('/api/auth/login')
      .send({ email: 'kelly@ejemplo.co', password: r.passwordTemporal })
      .expect(200);
    await t.http().delete(`/api/config/usuarios/${inv.id}`).set(duena).expect(204);
  });

  it('recuperación por correo: enlace de un solo uso (sin SES queda en el log)', async () => {
    const correo = t.app.get(CorreoService);
    correo.bandeja.length = 0;
    const r = await t
      .http()
      .post('/api/auth/recuperar')
      .send({ email: 'nadie@ejemplo.co' })
      .expect(202);
    expect(correo.bandeja).toHaveLength(0);
    await t
      .http()
      .post('/api/auth/recuperar')
      .send({ email: 'yuli@salon-ejemplo.ejemplo.co' })
      .expect(202);
    expect(r.body.mensaje).toContain('Si el correo está registrado');
    const m = correo.bandeja.at(-1)!;
    expect(m.para).toBe('yuli@salon-ejemplo.ejemplo.co');
    const token = /token=([A-Za-z0-9_-]+)/.exec(m.texto)![1];
    await t
      .http()
      .post('/api/auth/restablecer')
      .send({ token: 'x'.repeat(43), nueva: 'yuli-clave-nueva-1' })
      .expect(400);
    await t
      .http()
      .post('/api/auth/restablecer')
      .send({ token, nueva: 'yuli-clave-nueva-1' })
      .expect(204);
    await t
      .http()
      .post('/api/auth/restablecer')
      .send({ token, nueva: 'otra-clave-nueva-2' })
      .expect(400);
    await t
      .http()
      .post('/api/auth/login')
      .send({ email: 'yuli@salon-ejemplo.ejemplo.co', password: 'yuli-clave-nueva-1' })
      .expect(200);
  });
});
