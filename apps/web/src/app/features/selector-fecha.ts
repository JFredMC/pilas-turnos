import { Component, computed, inject, output } from '@angular/core';
import { TurnosStore } from '../core/turnos.store';

const sumarDias = (fecha: string, n: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Selector de día compartido por la agenda y la caja: ‹ fecha › y botón "Hoy". */
@Component({
  selector: 'app-selector-fecha',
  template: `
    <div class="selector-fecha" role="group" aria-label="Día">
      <button type="button" class="icono" (click)="mover(-1)" aria-label="Día anterior">‹</button>
      <label class="sr-only" for="fecha-dia">Fecha</label>
      <input
        id="fecha-dia"
        type="date"
        [value]="store.fecha()"
        (change)="elegir($any($event.target).value)"
      />
      <button type="button" class="icono" (click)="mover(1)" aria-label="Día siguiente">›</button>
      @if (!store.esHoy()) {
        <button type="button" class="ghost sm" (click)="elegir(store.hoy())">Hoy</button>
      }
    </div>
    <p class="muted titulo-fecha">{{ etiqueta() }}</p>
  `,
})
export class SelectorFecha {
  protected readonly store = inject(TurnosStore);
  readonly cambio = output<string>();
  protected readonly etiqueta = computed(() => {
    const f = this.store.fecha();
    const texto = new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
    return this.store.esHoy() ? `Hoy, ${texto}` : texto.charAt(0).toUpperCase() + texto.slice(1);
  });
  mover(n: number) {
    this.elegir(sumarDias(this.store.fecha(), n));
  }
  elegir(f: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return;
    this.store.fecha.set(f);
    this.cambio.emit(f);
  }
}
