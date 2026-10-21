import { Injectable, computed, signal } from '@angular/core';
import {
  CITAS_EJEMPLO,
  ESPERA_EJEMPLO,
  ESTILISTAS,
  HORA_APERTURA,
  HORA_CIERRE,
  SERVICIOS,
} from './datos-ejemplo';
import { Cita, Cupo, EstadoCita, Espera, Estilista, MedioPago, Servicio } from './modelos';
import { CuadreEstilista, cuadrePorEstilista, horariosLibres } from './calculos';
import { api } from './api';

const hoy = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
const aFront = (e: string): EstadoCita => (e === 'no_llego' ? 'no-llego' : (e as EstadoCita));
const aApi = (e: EstadoCita) => (e === 'no-llego' ? 'no_llego' : e);

/**
 * Estado de la app. Sin API (vista previa de GitHub Pages) usa los datos de ejemplo en memoria;
 * con PILAS_API_URL lee y escribe en la API de Pilas.
 */
@Injectable({ providedIn: 'root' })
export class TurnosStore {
  /** true mientras se use la API; pasa a false si no responde (respaldo con datos de ejemplo). */
  private readonly modoApi = signal(api.activa());
  get conApi(): boolean {
    return this.modoApi();
  }
  /** 'despertando': la API del plan gratis de Render tarda ~50 s en la primera carga. */
  readonly estadoApi = signal<'listo' | 'conectando' | 'despertando' | 'sin-conexion'>(
    api.activa() ? 'conectando' : 'listo',
  );
  private despierta: Promise<boolean> | null = null;
  readonly salonNombre = signal('Salón Ejemplo');
  readonly abonoCop = signal(5000);
  readonly servicios = signal<Servicio[]>(this.conApi ? [] : SERVICIOS);
  readonly estilistas = signal<Estilista[]>(this.conApi ? [] : ESTILISTAS);
  readonly citas = signal<Cita[]>(this.conApi ? [] : structuredClone(CITAS_EJEMPLO));
  readonly espera = signal<Espera[]>(this.conApi ? [] : structuredClone(ESPERA_EJEMPLO));
  readonly error = signal<string | null>(null);
  readonly sesion = signal<{ nombre: string; rol: 'duena' | 'estilista' } | null>(null);
  private readonly cuadreApi = signal<CuadreEstilista[]>([]);
  readonly cuadre = computed(() =>
    this.conApi
      ? this.cuadreApi()
      : cuadrePorEstilista(this.citas(), this.servicios(), this.estilistas()),
  );

  servicio(id: string) {
    return this.servicios().find((s) => s.id === id);
  }
  estilista(id: string) {
    return this.estilistas().find((e) => e.id === id);
  }
  logueado(): boolean {
    return !this.conApi || !!api.token();
  }

  private async intentar<T>(fn: () => Promise<T>): Promise<T | undefined> {
    this.error.set(null);
    try {
      return await fn();
    } catch (e) {
      this.error.set((e as Error).message);
      return undefined;
    }
  }

  /** Espera a que la API despierte (hasta ~75 s). Si no responde, cambia a datos de ejemplo. */
  despertar(limiteMs = 75_000): Promise<boolean> {
    if (!api.activa()) return Promise.resolve(false);
    this.despierta ??= (async () => {
      const aviso = setTimeout(
        () => this.estadoApi() === 'conectando' && this.estadoApi.set('despertando'),
        2_500,
      );
      const fin = Date.now() + limiteMs;
      try {
        while (Date.now() < fin) {
          if (await api.salud(Math.min(30_000, Math.max(1_000, fin - Date.now())))) {
            this.estadoApi.set('listo');
            return true;
          }
          await new Promise((r) => setTimeout(r, 3_000));
        }
        this.usarEjemplo();
        return false;
      } finally {
        clearTimeout(aviso);
      }
    })();
    return this.despierta;
  }

  /** Respaldo: la vista previa sigue funcionando con los datos de ejemplo si la API falla. */
  usarEjemplo(): void {
    this.modoApi.set(false);
    this.estadoApi.set('sin-conexion');
    this.salonNombre.set('Salón Ejemplo');
    this.abonoCop.set(5000);
    this.servicios.set(SERVICIOS);
    this.estilistas.set(ESTILISTAS);
    this.citas.set(structuredClone(CITAS_EJEMPLO));
    this.espera.set(structuredClone(ESPERA_EJEMPLO));
  }

  // ---------- Público ----------
  async cargarSalonPublico(): Promise<void> {
    if (!(await this.despertar()) || !this.conApi) return;
    const ok = await this.intentar(async () => {
      const r = await api.pedir<{
        salon: { nombre: string; abonoCop: number };
        servicios: Servicio[];
        estilistas: { id: string; nombre: string }[];
      }>('GET', `/publico/${api.slug}`);
      this.salonNombre.set(r.salon.nombre);
      this.abonoCop.set(r.salon.abonoCop);
      this.servicios.set(r.servicios);
      this.estilistas.set(r.estilistas.map((e) => ({ ...e, comision: 0 })));
      return true;
    });
    if (!ok) {
      this.usarEjemplo();
      this.error.set(null);
    }
  }

  async cupos(servicioId: string, estilistaId: string, fecha = hoy()): Promise<Cupo[]> {
    if (!this.conApi) {
      const s = this.servicio(servicioId);
      return s
        ? horariosLibres(
            this.citas(),
            this.servicios(),
            estilistaId,
            s.minutos,
            HORA_APERTURA,
            HORA_CIERRE,
          ).map((hora) => ({ hora }))
        : [];
    }
    const q = new URLSearchParams({ servicioId, estilistaId, fecha });
    const r = await this.intentar(() =>
      api.pedir<{ cupos: Cupo[] }>('GET', `/publico/${api.slug}/disponibilidad?${q}`),
    );
    return r?.cupos ?? [];
  }

  async reservar(c: {
    clienta: string;
    telefono: string;
    servicioId: string;
    estilistaId: string;
    cupo: Cupo;
    abonar: boolean;
  }): Promise<Cita | null> {
    const abono = c.abonar ? this.abonoCop() : 0;
    if (!this.conApi) {
      const nueva: Cita = {
        clienta: c.clienta,
        telefono: c.telefono,
        servicioId: c.servicioId,
        estilistaId: c.estilistaId,
        hora: c.cupo.hora,
        abono,
        id: `c${Date.now()}`,
        estado: abono > 0 ? 'confirmada' : 'pendiente',
      };
      this.citas.update((l) => [...l, nueva].sort((a, b) => a.hora.localeCompare(b.hora)));
      return nueva;
    }
    const r = await this.intentar(() =>
      api.pedir<{
        cita: { id: string; codigo: string; hora: string; estado: string };
        abono: { monto: number } | null;
      }>('POST', `/publico/${api.slug}/reservas`, {
        servicioId: c.servicioId,
        estilistaId: c.estilistaId,
        inicio: c.cupo.inicio,
        nombre: c.clienta,
        telefono: c.telefono,
        abonar: c.abonar,
        consentimiento: true,
      }),
    );
    if (!r) return null;
    return {
      id: r.cita.id,
      codigo: r.cita.codigo,
      clienta: c.clienta,
      telefono: c.telefono,
      servicioId: c.servicioId,
      estilistaId: c.estilistaId,
      hora: r.cita.hora,
      estado: aFront(r.cita.estado),
      abono: r.abono?.monto ?? 0,
    };
  }

  // ---------- Salón (requiere login con API) ----------
  async ingresar(email: string, password: string): Promise<'ok' | 'cambiar' | null> {
    if (!(await this.despertar())) return null;
    const r = await this.intentar(() =>
      api.pedir<{
        token: string;
        usuario: { nombre: string; rol: 'duena' | 'estilista'; debeCambiarPassword?: boolean };
      }>('POST', '/auth/login', { email, password }),
    );
    if (!r) return null;
    api.guardarToken(r.token);
    api.marcarCambio(!!r.usuario.debeCambiarPassword);
    this.sesion.set(r.usuario);
    return r.usuario.debeCambiarPassword ? 'cambiar' : 'ok';
  }
  /** Rol de la sesión actual (del token). */
  rol(): 'duena' | 'estilista' | null {
    return this.conApi ? (api.sesion()?.rol ?? null) : 'duena';
  }
  async cambiarClave(actual: string, nueva: string): Promise<boolean> {
    const r = await this.intentar(() =>
      api.pedir<{ token: string }>('POST', '/auth/cambiar-password', { actual, nueva }),
    );
    if (!r) return false;
    api.guardarToken(r.token);
    api.marcarCambio(false);
    return true;
  }
  async pedirRecuperacion(email: string): Promise<string | null> {
    const r = await this.intentar(() =>
      api.pedir<{ mensaje: string }>('POST', '/auth/recuperar', { email }),
    );
    return r?.mensaje ?? null;
  }
  async restablecer(token: string, nueva: string): Promise<boolean> {
    return (
      (await this.intentar(() =>
        api.pedir('POST', '/auth/restablecer', { token, nueva }).then(() => true),
      )) === true
    );
  }
  salir() {
    api.guardarToken(null);
    api.marcarCambio(false);
    this.sesion.set(null);
  }

  async cargarSalon(): Promise<void> {
    if (!(await this.despertar()) || !this.conApi) return;
    await this.intentar(async () => {
      const [info, ag, esp] = await Promise.all([
        api.pedir<{
          salon: { nombre: string; abonoCop: number };
          servicios: Servicio[];
          estilistas: { id: string; nombre: string; comisionPct: number }[];
        }>('GET', '/salon'),
        api.pedir<{
          citas: (Cita & { estado: string; clienta: string; telefono: string | null })[];
        }>('GET', `/salon/agenda?fecha=${hoy()}`),
        api.pedir<
          {
            id: string;
            clienta: string;
            telefono: string;
            servicioId: string | null;
            preferencia: string;
          }[]
        >('GET', '/salon/espera'),
      ]);
      this.salonNombre.set(info.salon.nombre);
      this.abonoCop.set(info.salon.abonoCop);
      this.servicios.set(info.servicios);
      this.estilistas.set(
        info.estilistas.map((e) => ({ id: e.id, nombre: e.nombre, comision: e.comisionPct / 100 })),
      );
      this.citas.set(
        ag.citas.map((c) => ({ ...c, telefono: c.telefono ?? '', estado: aFront(c.estado) })),
      );
      this.espera.set(esp.map((e) => ({ ...e, servicioId: e.servicioId ?? '' })));
    });
  }

  async cargarCaja(): Promise<void> {
    if (!(await this.despertar()) || !this.conApi) return;
    const r = await this.intentar(() =>
      api.pedir<{
        estilistas: (Omit<CuadreEstilista, 'estilista'> & {
          estilistaId: string;
          nombre: string;
          comisionPct: number;
        })[];
      }>('GET', `/salon/caja?fecha=${hoy()}`),
    );
    if (r)
      this.cuadreApi.set(
        r.estilistas.map((f) => ({
          ...f,
          estilista: { id: f.estilistaId, nombre: f.nombre, comision: f.comisionPct / 100 },
        })),
      );
  }

  async cambiarEstado(id: string, estado: EstadoCita, medio?: MedioPago): Promise<void> {
    if (this.conApi) {
      const ok = await this.intentar(() =>
        api.pedir('PATCH', `/salon/citas/${id}`, {
          estado: aApi(estado),
          ...(medio ? { medio } : {}),
        }),
      );
      if (ok === undefined) return;
    }
    this.citas.update((l) => l.map((c) => (c.id === id ? { ...c, estado } : c)));
  }

  async confirmarAbono(pagoId: string): Promise<void> {
    if (
      (await this.intentar(() => api.pedir('POST', `/salon/pagos/${pagoId}/confirmar`))) !==
      undefined
    )
      await this.cargarSalon();
  }

  async agregarEspera(e: Omit<Espera, 'id'>): Promise<void> {
    if (!this.conApi) {
      this.espera.update((l) => [...l, { ...e, id: `e${Date.now()}` }]);
      return;
    }
    const r = await this.intentar(() =>
      api.pedir<{ id: string }>('POST', '/salon/espera', {
        nombre: e.clienta,
        telefono: e.telefono,
        servicioId: e.servicioId || undefined,
        preferencia: e.preferencia,
        consentimiento: true,
      }),
    );
    if (r) this.espera.update((l) => [...l, { ...e, id: r.id }]);
  }

  async quitarEspera(id: string): Promise<void> {
    if (
      this.conApi &&
      (await this.intentar(() => api.pedir('DELETE', `/salon/espera/${id}`).then(() => true))) !==
        true
    )
      return;
    this.espera.update((l) => l.filter((e) => e.id !== id));
  }
}
