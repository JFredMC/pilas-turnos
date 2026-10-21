import { Injectable, signal } from '@angular/core';
import { api } from './api';

export interface SalonConfig {
  id: string;
  slug: string;
  nombre: string;
  ciudad: string;
  whatsapp: string | null;
  nequiNumero: string | null;
  abonoActivo: boolean;
  abonoCop: number;
}
export interface ServicioConfig {
  id: string;
  nombre: string;
  minutos: number;
  precio: number;
  activo: number;
}
export interface Franja {
  diaSemana: number;
  abre: string;
  cierra: string;
}
export interface EstilistaConfig {
  id: string;
  nombre: string;
  comisionPct: number;
  activo: boolean;
  horario: Franja[];
}
export interface Excepcion {
  id: string;
  estilistaId: string | null;
  fecha: string;
  cerrado: boolean;
  abre: string | null;
  cierra: string | null;
  motivo: string | null;
}
export interface UsuarioEquipo {
  id: string;
  nombre: string;
  email: string;
  rol: 'duena' | 'estilista';
  estilistaId: string | null;
  debeCambiarPassword: boolean;
}

/** Configuración del salón (solo dueña, con API). Cada acción recarga lo que cambió. */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  readonly salon = signal<SalonConfig | null>(null);
  readonly servicios = signal<ServicioConfig[]>([]);
  readonly estilistas = signal<EstilistaConfig[]>([]);
  readonly excepciones = signal<Excepcion[]>([]);
  readonly usuarios = signal<UsuarioEquipo[]>([]);
  readonly error = signal<string | null>(null);
  readonly ok = signal<string | null>(null);
  readonly cargando = signal(false);

  private async hacer<T>(fn: () => Promise<T>, exito?: string): Promise<T | undefined> {
    this.error.set(null);
    this.ok.set(null);
    try {
      const r = await fn();
      if (exito) this.ok.set(exito);
      return r;
    } catch (e) {
      this.error.set((e as Error).message);
      return undefined;
    }
  }

  async cargarTodo(): Promise<void> {
    if (!api.activa()) return;
    this.cargando.set(true);
    await this.hacer(async () => {
      const [s, sv, es, ex, us] = await Promise.all([
        api.pedir<SalonConfig>('GET', '/config/salon'),
        api.pedir<ServicioConfig[]>('GET', '/config/servicios'),
        api.pedir<EstilistaConfig[]>('GET', '/config/estilistas'),
        api.pedir<Excepcion[]>('GET', '/config/excepciones'),
        api.pedir<UsuarioEquipo[]>('GET', '/config/usuarios'),
      ]);
      this.salon.set(s);
      this.servicios.set(sv);
      this.estilistas.set(es);
      this.excepciones.set(ex);
      this.usuarios.set(us);
    });
    this.cargando.set(false);
  }

  guardarSalon(cambios: Partial<SalonConfig>) {
    return this.hacer(
      async () => this.salon.set(await api.pedir<SalonConfig>('PATCH', '/config/salon', cambios)),
      'Datos del salón guardados.',
    );
  }

  private async recargarServicios() {
    this.servicios.set(await api.pedir<ServicioConfig[]>('GET', '/config/servicios'));
  }
  crearServicio(s: { nombre: string; minutos: number; precio: number }) {
    return this.hacer(async () => {
      await api.pedir('POST', '/config/servicios', s);
      await this.recargarServicios();
    }, 'Servicio creado.');
  }
  editarServicio(
    id: string,
    s: Partial<{ nombre: string; minutos: number; precio: number; activo: boolean }>,
  ) {
    return this.hacer(async () => {
      await api.pedir('PATCH', `/config/servicios/${id}`, s);
      await this.recargarServicios();
    }, 'Servicio actualizado.');
  }
  borrarServicio(id: string) {
    return this.hacer(async () => {
      const r = await api.pedir<{ resultado: string }>('DELETE', `/config/servicios/${id}`);
      await this.recargarServicios();
      this.ok.set(
        r.resultado === 'desactivado'
          ? 'Tenía citas: quedó desactivado para conservar el historial.'
          : 'Servicio borrado.',
      );
    });
  }

  private async recargarEstilistas() {
    this.estilistas.set(await api.pedir<EstilistaConfig[]>('GET', '/config/estilistas'));
  }
  crearEstilista(e: { nombre: string; comisionPct: number }) {
    return this.hacer(async () => {
      await api.pedir('POST', '/config/estilistas', e);
      await this.recargarEstilistas();
    }, 'Estilista agregada.');
  }
  editarEstilista(
    id: string,
    e: Partial<{ nombre: string; comisionPct: number; activo: boolean }>,
  ) {
    return this.hacer(async () => {
      await api.pedir('PATCH', `/config/estilistas/${id}`, e);
      await this.recargarEstilistas();
    }, 'Estilista actualizada.');
  }
  guardarHorario(id: string, franjas: Franja[]) {
    return this.hacer(async () => {
      await api.pedir('PUT', `/config/estilistas/${id}/horario`, { franjas });
      await this.recargarEstilistas();
    }, 'Horario guardado.');
  }

  private async recargarExcepciones() {
    this.excepciones.set(await api.pedir<Excepcion[]>('GET', '/config/excepciones'));
  }
  crearExcepcion(e: {
    estilistaId: string | null;
    fecha: string;
    cerrado: boolean;
    abre?: string;
    cierra?: string;
    motivo?: string;
  }) {
    return this.hacer(async () => {
      await api.pedir('POST', '/config/excepciones', e);
      await this.recargarExcepciones();
    }, 'Excepción agregada.');
  }
  borrarExcepcion(id: string) {
    return this.hacer(async () => {
      await api.pedir('DELETE', `/config/excepciones/${id}`);
      await this.recargarExcepciones();
    }, 'Excepción quitada.');
  }

  private async recargarUsuarios() {
    this.usuarios.set(await api.pedir<UsuarioEquipo[]>('GET', '/config/usuarios'));
  }
  invitar(u: { nombre: string; email: string; estilistaId: string }) {
    return this.hacer(async () => {
      const r = await api.pedir<{ passwordTemporal: string; email: string }>(
        'POST',
        '/config/usuarios',
        u,
      );
      await this.recargarUsuarios();
      return r;
    }, 'Usuario creado. Comparte la contraseña temporal por un medio privado.');
  }
  restablecerUsuario(id: string) {
    return this.hacer(async () => {
      const r = await api.pedir<{ passwordTemporal: string }>(
        'POST',
        `/config/usuarios/${id}/restablecer`,
      );
      await this.recargarUsuarios();
      return r;
    }, 'Contraseña temporal nueva generada.');
  }
  borrarUsuario(id: string) {
    return this.hacer(async () => {
      await api.pedir('DELETE', `/config/usuarios/${id}`);
      await this.recargarUsuarios();
    }, 'Usuario borrado.');
  }
}
