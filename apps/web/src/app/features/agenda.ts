import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TurnosStore } from '../core/turnos.store';
import { formatoCop } from '../core/calculos';
import { EstadoCita } from '../core/modelos';

@Component({
  selector: 'app-agenda',
  template: `
    <h1>Agenda de hoy</h1>
    @if (store.error()) {
      <p class="aviso" role="alert">{{ store.error() }}</p>
    }
    <div class="tabs" role="tablist" aria-label="Estilistas">
      <button
        role="tab"
        type="button"
        [attr.aria-selected]="filtro() === 'todas'"
        (click)="filtro.set('todas')"
      >
        Todas
      </button>
      @for (e of store.estilistas(); track e.id) {
        <button
          role="tab"
          type="button"
          [attr.aria-selected]="filtro() === e.id"
          (click)="filtro.set(e.id)"
        >
          {{ e.nombre.split(' ')[0] }}
        </button>
      }
    </div>
    @for (g of grupos(); track g.estilista.id) {
      <section class="card">
        <h2 class="h-est">
          <span class="avatar" aria-hidden="true">{{ g.estilista.nombre[0] }}</span
          >{{ g.estilista.nombre }}
        </h2>
        @if (g.citas.length) {
          <ul class="citas">
            @for (c of g.citas; track c.id) {
              <li [class]="'cita ' + c.estado">
                <span class="hora">{{ c.hora }}</span>
                <span class="crece"
                  ><strong>{{ c.clienta }}</strong
                  ><small class="muted"
                    >{{ store.servicio(c.servicioId)?.nombre
                    }}{{ c.abono ? ' · abonó ' + cop(c.abono) : '' }}</small
                  ></span
                >
                <label class="sr-only" [for]="'est-' + c.id">Estado de {{ c.clienta }}</label>
                <select
                  [id]="'est-' + c.id"
                  [value]="c.estado"
                  (change)="cambiar(c.id, $any($event.target).value)"
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="confirmada">Confirmada</option>
                  <option value="atendida">Atendida</option>
                  <option value="no-llego">No llegó</option>
                  <option value="cancelada">Cancelada</option>
                </select>
                @if (c.abonoPendienteId) {
                  <button
                    type="button"
                    class="btn sm"
                    (click)="store.confirmarAbono(c.abonoPendienteId)"
                    [attr.aria-label]="'Confirmar abono de ' + c.clienta"
                  >
                    Abono llegó
                  </button>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="muted">Sin citas.</p>
        }
      </section>
    }
  `,
})
export class Agenda implements OnInit {
  ngOnInit() {
    void this.store.cargarSalon();
  }
  protected readonly store = inject(TurnosStore);
  protected readonly cop = formatoCop;
  protected readonly filtro = signal<string>('todas');
  protected readonly grupos = computed(() =>
    this.store
      .estilistas()
      .filter((e) => this.filtro() === 'todas' || this.filtro() === e.id)
      .map((e) => ({
        estilista: e,
        citas: this.store.citas().filter((c) => c.estilistaId === e.id),
      })),
  );
  cambiar(id: string, estado: EstadoCita) {
    this.store.cambiarEstado(id, estado);
  }
}
