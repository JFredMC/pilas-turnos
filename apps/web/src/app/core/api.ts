import { ENTORNO } from './entorno';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
    readonly codigo?: string,
  ) {
    super(mensaje);
  }
}

const CLAVE_TOKEN = 'pilas-token';

/** Cliente mínimo de la API de Pilas (fetch). Solo se usa si ENTORNO.apiUrl está definida. */
export const api = {
  activa: (): boolean => !!ENTORNO.apiUrl,
  slug: ENTORNO.salonSlug,
  /** Datos del token (sin verificar: solo para la interfaz; la API valida todo). */
  sesion(): { sub: string; rol: 'duena' | 'estilista'; estilistaId: string | null } | null {
    const t = this.token();
    if (!t) return null;
    try {
      const b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(b))));
    } catch {
      return null;
    }
  },
  cambioPendiente(): boolean {
    try {
      return sessionStorage.getItem('pilas-cambio') === '1';
    } catch {
      return false;
    }
  },
  marcarCambio(v: boolean) {
    try {
      v ? sessionStorage.setItem('pilas-cambio', '1') : sessionStorage.removeItem('pilas-cambio');
    } catch {
      /* sin almacenamiento */
    }
  },
  token(): string | null {
    try {
      return sessionStorage.getItem(CLAVE_TOKEN);
    } catch {
      return null;
    }
  },
  guardarToken(t: string | null) {
    try {
      t ? sessionStorage.setItem(CLAVE_TOKEN, t) : sessionStorage.removeItem(CLAVE_TOKEN);
    } catch {
      /* sin almacenamiento */
    }
  },
  /** Ping a /api/health con tiempo límite; false si no responde. */
  async salud(timeoutMs: number): Promise<boolean> {
    try {
      const r = await fetch(`${ENTORNO.apiUrl}/api/health`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      return r.ok;
    } catch {
      return false;
    }
  },
  url(ruta: string): string {
    return `${ENTORNO.apiUrl}/api${ruta}`;
  },
  /** Sube un archivo binario (p. ej. la imagen del QR) con su Content-Type. */
  async subir<T>(ruta: string, archivo: Blob): Promise<T> {
    const r = await fetch(this.url(ruta), {
      method: 'PUT',
      signal: AbortSignal.timeout(60_000),
      headers: {
        'Content-Type': archivo.type || 'application/octet-stream',
        Authorization: `Bearer ${this.token() ?? ''}`,
      },
      body: archivo,
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok)
      throw new ApiError(
        r.status,
        typeof datos?.message === 'string' ? datos.message : 'No se pudo subir el archivo.',
      );
    return datos as T;
  },
  async pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
    const t = this.token();
    if (t && !ruta.startsWith('/publico')) headers['Authorization'] = `Bearer ${t}`;
    const r = await fetch(`${ENTORNO.apiUrl}/api${ruta}`, {
      method: metodo,
      signal: AbortSignal.timeout(30_000),
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    if (r.status === 204) return undefined as T;
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 && !ruta.startsWith('/auth')) this.guardarToken(null);
      const msg =
        datos?.errores?.[0]?.detalle ??
        (typeof datos?.message === 'string' ? datos.message : null) ??
        datos?.mensaje ??
        'Algo salió mal. Intenta de nuevo.';
      if (datos?.codigo === 'CAMBIO_PASSWORD') this.marcarCambio(true);
      throw new ApiError(r.status, msg, datos?.codigo);
    }
    return datos as T;
  },
};
