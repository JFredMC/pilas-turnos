import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TurnosStore } from '../core/turnos.store';
import { enlaceWhatsapp } from '../core/calculos';

@Component({
  selector: 'app-espera',
  imports: [FormsModule],
  template: `
    <h1>Lista de espera</h1>
    <p class="muted">
      Cuando una clienta cancela o no llega, avísale a la primera de la lista con un toque.
    </p>
    @if (libres() > 0) {
      <p class="aviso" role="status">
        Hay {{ libres() }} cupo(s) liberado(s) hoy por clientas que no llegaron.
      </p>
    }
    <ol class="lista">
      @for (e of store.espera(); track e.id; let i = $index) {
        <li class="card fila">
          <span class="num" aria-hidden="true">{{ i + 1 }}</span>
          <span class="crece"
            ><strong>{{ e.clienta }}</strong
            ><small class="muted"
              >{{ store.servicio(e.servicioId)?.nombre }} · {{ e.preferencia }}</small
            ></span
          >
          <a
            class="btn sm wa"
            [href]="aviso(e.clienta, e.telefono)"
            target="_blank"
            rel="noopener"
            [attr.aria-label]="'Avisar a ' + e.clienta + ' por WhatsApp'"
            >Avisar</a
          >
          <button
            class="ghost sm"
            type="button"
            (click)="store.quitarEspera(e.id)"
            [attr.aria-label]="'Quitar a ' + e.clienta"
          >
            ✕
          </button>
        </li>
      } @empty {
        <li class="muted">Nadie en espera.</li>
      }
    </ol>
    <form class="card form" (ngSubmit)="agregar()">
      <h2>Anotar clienta</h2>
      <label for="en">Nombre</label>
      <input id="en" name="en" [(ngModel)]="nombre" required />
      <label for="et">Celular</label>
      <input id="et" name="et" [(ngModel)]="telefono" inputmode="tel" />
      <label for="es">Servicio</label>
      <select id="es" name="es" [(ngModel)]="servicioId">
        @for (s of store.servicios(); track s.id) {
          <option [value]="s.id">{{ s.nombre }}</option>
        }
      </select>
      <label for="ep">Preferencia</label>
      <input id="ep" name="ep" [(ngModel)]="preferencia" placeholder="Ej.: mañana temprano" />
      <label class="check"
        ><input type="checkbox" name="acepta" [(ngModel)]="acepta" required /> La clienta autorizó
        guardar su nombre y celular (Ley 1581)</label
      >
      <button class="btn" type="submit" [disabled]="!nombre.trim() || !acepta">
        Agregar a la lista
      </button>
    </form>
  `,
})
export class EsperaPage implements OnInit {
  protected readonly store = inject(TurnosStore);
  protected nombre = '';
  protected telefono = '';
  protected servicioId = this.store.servicios()[0]?.id ?? '';
  protected acepta = false;
  ngOnInit() {
    void this.store.cargarSalon();
  }
  protected preferencia = '';
  libres() {
    return this.store.citas().filter((c) => c.estado === 'no-llego').length;
  }
  aviso(nombre: string, tel: string) {
    return enlaceWhatsapp(
      `¡Hola ${nombre}! Se liberó un cupo hoy en ${this.store.salonNombre()}. ¿Lo quieres? Responde SÍ y te lo separamos.`,
      tel,
    );
  }
  agregar() {
    if (!this.nombre.trim() || !this.acepta) return;
    this.store.agregarEspera({
      clienta: this.nombre.trim(),
      telefono: this.telefono,
      servicioId: this.servicioId,
      preferencia: this.preferencia || 'Cualquier hora',
    });
    this.nombre = this.telefono = this.preferencia = '';
    this.acepta = false;
  }
}
