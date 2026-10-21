import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { citas, clientas, estilistas, salones, servicios } from '../src/db/schema';
import { RecordatoriosService, recordatoriosPendientes } from '../src/recordatorios';
import { prepararApp } from './helpers';

const H = 3_600_000;
let t: Awaited<ReturnType<typeof prepararApp>>;
let salonId: string;

let n = 0;
async function crearCita(desdeAhoraH: number, creadaHaceH: number, codigo: string, ctx = t) {
  const t = ctx;
  n++;
  const [s] = await t.db.select().from(salones).where(eq(salones.slug, 'salon-ejemplo'));
  salonId = s.id;
  const est = await t.db.select().from(estilistas).where(eq(estilistas.salonId, s.id));
  const e = est[n % est.length];
  const [sv] = await t.db.select().from(servicios).where(eq(servicios.salonId, s.id));
  const [cl] = await t.db
    .insert(clientas)
    .values({
      salonId: s.id,
      nombre: `Clienta ${codigo}`,
      telefono: `31000000${codigo.slice(-2)}`,
      consentimientoEn: new Date(),
      consentimientoVersion: 't',
    })
    .returning();
  // Minutos aleatorios lejos de las citas del seed para no chocar.
  const inicio = new Date(Date.now() + desdeAhoraH * H + n * 11 * 60_000);
  const [c] = await t.db
    .insert(citas)
    .values({
      salonId: s.id,
      estilistaId: e.id,
      servicioId: sv.id,
      clientaId: cl.id,
      inicio,
      fin: new Date(inicio.getTime() + 10 * 60_000),
      precio: sv.precio,
      codigo,
      creadoEn: new Date(Date.now() - creadaHaceH * H),
    })
    .returning();
  return c;
}

beforeAll(async () => {
  t = await prepararApp({ cronToken: 'c'.repeat(32) });
});
afterAll(() => t.cerrar());
afterEach(() => vi.unstubAllGlobals());

describe('recordatorios por WhatsApp', () => {
  it('detecta los de 24 h y 2 h según la anticipación de la reserva', async () => {
    const a = await crearCita(20, 48, 'REC024'); // tocan 24 h
    const b = await crearCita(1.5, 48, 'REC002'); // tocan 2 h
    await crearCita(20, 1, 'REC100'); // reservada hace 1 h para dentro de 20 h: no hay de 24 h
    const p = await recordatoriosPendientes(t.db, new Date(), salonId);
    const mios = p.filter((x) => x.codigo.startsWith('REC'));
    expect(mios.map((x) => `${x.codigo}:${x.tipo}`).sort()).toEqual(['REC002:2h', 'REC024:24h']);
    expect([a.id, b.id]).toContain(mios[0].citaId);
  });

  it('sin credenciales de Meta no envía nada y el panel da el enlace wa.me', async () => {
    const r = await t.app.get(RecordatoriosService).procesar();
    expect(r.whatsapp).toBe(false);
    expect(r.enviados).toBe(0);
    const duena = await t.login('duena@salon-ejemplo.ejemplo.co');
    const lista = (
      await t
        .http()
        .get('/api/salon/recordatorios')
        .set('Authorization', `Bearer ${duena}`)
        .expect(200)
    ).body;
    expect(lista.whatsappAutomatico).toBe(false);
    const rec = lista.pendientes.find((x: any) => x.clienta === 'Clienta REC024');
    expect(rec.enlace).toMatch(/^https:\/\/wa\.me\/5731000000\d\d\?text=/);
    expect(decodeURIComponent(rec.enlace)).toContain('mañana');
    await t
      .http()
      .post('/api/salon/recordatorios/manual')
      .set('Authorization', `Bearer ${duena}`)
      .send({ citaId: rec.citaId, tipo: '24h' })
      .expect(204);
    const despues = (
      await t.http().get('/api/salon/recordatorios').set('Authorization', `Bearer ${duena}`)
    ).body.pendientes;
    expect(despues.find((x: any) => x.citaId === rec.citaId)).toBeUndefined();
  });

  it('el cron interno exige el token', async () => {
    await t.http().post('/api/interno/recordatorios').expect(401);
    await t
      .http()
      .post('/api/interno/recordatorios')
      .set('Authorization', 'Bearer ' + 'x'.repeat(32))
      .expect(401);
    const r = await t
      .http()
      .post('/api/interno/recordatorios')
      .set('Authorization', 'Bearer ' + 'c'.repeat(32))
      .expect(200);
    expect(r.body.whatsapp).toBe(false);
  });
});

describe('con WhatsApp Cloud API configurado', () => {
  let t2: Awaited<ReturnType<typeof prepararApp>>;
  beforeAll(async () => {
    t2 = await prepararApp({
      whatsapp: {
        token: 'tok',
        phoneNumberId: '123',
        plantilla: 'recordatorio_cita',
        idioma: 'es',
        apiVersion: 'v21.0',
      },
    });
  });
  afterAll(() => t2.cerrar());

  it('envía con plantilla, registra y no repite; reintenta los fallidos', async () => {
    await crearCita(1, 48, 'WAP001', t2);
    await crearCita(1.2, 48, 'WAP002', t2);
    const llamadas: any[] = [];
    let falla = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        llamadas.push({ url, body });
        if (falla && body.template.components[0].parameters[0].text === 'Clienta WAP002') {
          return new Response(JSON.stringify({ error: { message: 'número inválido' } }), {
            status: 400,
          });
        }
        return new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 });
      }),
    );
    const svc = t2.app.get(RecordatoriosService);
    const r1 = await svc.procesar();
    expect(r1).toMatchObject({ enviados: 1, fallidos: 1, whatsapp: true });
    expect(llamadas[0].url).toBe('https://graph.facebook.com/v21.0/123/messages');
    expect(llamadas[0].body).toMatchObject({
      messaging_product: 'whatsapp',
      type: 'template',
      template: { name: 'recordatorio_cita' },
    });
    falla = false;
    const r2 = await svc.procesar();
    expect(r2).toMatchObject({ enviados: 1, fallidos: 0 });
    expect((await svc.procesar()).pendientes).toBe(0);
  });
});
