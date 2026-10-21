import { Component, OnInit, computed, inject } from '@angular/core';
import { TurnosStore } from '../core/turnos.store';
import { formatoCop } from '../core/calculos';

@Component({
  selector: 'app-caja',
  template: `
    <h1>Cuadre de caja de hoy</h1>
    <div class="totales">
      <div class="card kpi">
        <small>Ventas</small><strong>{{ cop(total().ventas) }}</strong>
      </div>
      <div class="card kpi">
        <small>Efectivo</small><strong>{{ cop(total().efectivo) }}</strong>
      </div>
      <div class="card kpi">
        <small>Nequi</small><strong>{{ cop(total().nequi) }}</strong>
      </div>
      <div class="card kpi destacado">
        <small>Queda al salón</small><strong>{{ cop(total().salon) }}</strong>
      </div>
    </div>
    @for (c of store.cuadre(); track c.estilista.id) {
      <section class="card">
        <h2 class="h-est">
          <span class="avatar" aria-hidden="true">{{ c.estilista.nombre[0] }}</span
          >{{ c.estilista.nombre }}
        </h2>
        <dl class="tabla">
          <dt>Servicios atendidos</dt>
          <dd>{{ c.servicios }}</dd>
          <dt>Ventas</dt>
          <dd>{{ cop(c.ventas) }}</dd>
          <dt>Comisión ({{ c.estilista.comision * 100 }} %)</dt>
          <dd>{{ cop(c.comision) }}</dd>
          <dt>Propinas</dt>
          <dd>{{ cop(c.propinas) }}</dd>
          <dt>Recibido en efectivo</dt>
          <dd>{{ cop(c.efectivo) }}</dd>
          <dt>Recibido por Nequi</dt>
          <dd>{{ cop(c.nequi) }}</dd>
          <dt class="fuerte">A pagarle hoy</dt>
          <dd class="fuerte">{{ cop(c.aPagar) }}</dd>
        </dl>
      </section>
    }
    <p class="muted nota">
      Cifras calculadas con las citas marcadas como "Atendida" en la agenda.{{
        store.conApi ? '' : ' Datos de ejemplo.'
      }}
    </p>
  `,
})
export class Caja implements OnInit {
  ngOnInit() {
    void this.store.cargarCaja();
  }
  protected readonly store = inject(TurnosStore);
  protected readonly cop = formatoCop;
  protected readonly total = computed(() => {
    const l = this.store.cuadre();
    const s = (k: 'ventas' | 'efectivo' | 'nequi' | 'aPagar') => l.reduce((a, c) => a + c[k], 0);
    const ventas = s('ventas');
    return {
      ventas,
      efectivo: s('efectivo'),
      nequi: s('nequi'),
      salon: ventas - l.reduce((a, c) => a + c.comision, 0),
    };
  });
}
