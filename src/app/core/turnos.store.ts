import { Injectable, computed, signal } from '@angular/core';
import { CITAS_EJEMPLO, ESPERA_EJEMPLO, ESTILISTAS, SERVICIOS } from './datos-ejemplo';
import { Cita, EstadoCita, Espera } from './modelos';
import { cuadrePorEstilista } from './calculos';

/** Estado en memoria del prototipo (sin backend). Se reinicia al recargar. */
@Injectable({ providedIn: 'root' })
export class TurnosStore {
  readonly servicios = SERVICIOS;
  readonly estilistas = ESTILISTAS;
  readonly citas = signal<Cita[]>(structuredClone(CITAS_EJEMPLO));
  readonly espera = signal<Espera[]>(structuredClone(ESPERA_EJEMPLO));
  readonly cuadre = computed(() =>
    cuadrePorEstilista(this.citas(), this.servicios, this.estilistas),
  );

  servicio(id: string) {
    return this.servicios.find((s) => s.id === id);
  }
  estilista(id: string) {
    return this.estilistas.find((e) => e.id === id);
  }

  reservar(c: Omit<Cita, 'id' | 'estado'>): Cita {
    const nueva: Cita = {
      ...c,
      id: `c${Date.now()}`,
      estado: c.abono > 0 ? 'confirmada' : 'pendiente',
    };
    this.citas.update((l) => [...l, nueva].sort((a, b) => a.hora.localeCompare(b.hora)));
    return nueva;
  }

  cambiarEstado(id: string, estado: EstadoCita): void {
    this.citas.update((l) => l.map((c) => (c.id === id ? { ...c, estado } : c)));
  }

  agregarEspera(e: Omit<Espera, 'id'>): void {
    this.espera.update((l) => [...l, { ...e, id: `e${Date.now()}` }]);
  }
  quitarEspera(id: string): void {
    this.espera.update((l) => l.filter((e) => e.id !== id));
  }
}
