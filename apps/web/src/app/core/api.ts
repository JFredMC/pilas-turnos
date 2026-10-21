import { ENTORNO } from './entorno';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

const CLAVE_TOKEN = 'pilas-token';

/** Cliente mínimo de la API de Pilas (fetch). Solo se usa si ENTORNO.apiUrl está definida. */
export const api = {
  activa: (): boolean => !!ENTORNO.apiUrl,
  slug: ENTORNO.salonSlug,
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
      throw new ApiError(r.status, msg);
    }
    return datos as T;
  },
};
