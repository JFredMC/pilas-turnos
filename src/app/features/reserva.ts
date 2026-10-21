import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TurnosStore } from '../core/turnos.store';
import { enlaceWhatsapp, formatoCop, horariosLibres } from '../core/calculos';
import { HORA_APERTURA, HORA_CIERRE } from '../core/datos-ejemplo';
import { Cita } from '../core/modelos';
import { QrSimulado } from './qr-simulado';

const ABONO = 5000;

@Component({
  selector: 'app-reserva',
  imports: [FormsModule, QrSimulado],
  templateUrl: './reserva.html',
})
export class Reserva {
  protected readonly store = inject(TurnosStore);
  protected readonly cop = formatoCop;
  protected readonly abono = ABONO;
  protected readonly paso = signal(1);
  protected readonly servicioId = signal<string | null>(null);
  protected readonly estilistaId = signal<string | null>(null);
  protected readonly hora = signal<string | null>(null);
  protected nombre = '';
  protected telefono = '';
  protected readonly pagarAbono = signal(true);
  protected readonly cita = signal<Cita | null>(null);

  protected readonly servicio = computed(() => this.store.servicio(this.servicioId() ?? ''));
  protected readonly estilista = computed(() => this.store.estilista(this.estilistaId() ?? ''));
  protected readonly horarios = computed(() => {
    const s = this.servicio(),
      e = this.estilistaId();
    if (!s || !e) return [];
    return horariosLibres(
      this.store.citas(),
      this.store.servicios,
      e,
      s.minutos,
      HORA_APERTURA,
      HORA_CIERRE,
    );
  });
  protected readonly whatsapp = computed(() => {
    const c = this.cita(),
      s = this.servicio(),
      e = this.estilista();
    if (!c || !s || !e) return '#';
    return enlaceWhatsapp(
      `¡Hola! Separé mi turno en Salón Ejemplo: ${s.nombre} con ${e.nombre}, hoy a las ${c.hora}. ` +
        (c.abono ? `Ya aboné ${formatoCop(c.abono)} por Nequi.` : 'Pago todo en el salón.'),
    );
  });

  elegirServicio(id: string) {
    this.servicioId.set(id);
    this.hora.set(null);
    this.paso.set(2);
  }
  elegirEstilista(id: string) {
    this.estilistaId.set(id);
    this.hora.set(null);
    this.paso.set(3);
  }
  elegirHora(h: string) {
    this.hora.set(h);
    this.paso.set(4);
  }
  atras() {
    this.paso.update((p) => Math.max(1, p - 1));
  }

  confirmar() {
    const s = this.servicio(),
      e = this.estilistaId(),
      h = this.hora();
    if (!s || !e || !h || !this.nombre.trim()) return;
    this.cita.set(
      this.store.reservar({
        clienta: this.nombre.trim(),
        telefono: this.telefono,
        servicioId: s.id,
        estilistaId: e,
        hora: h,
        abono: this.pagarAbono() ? ABONO : 0,
      }),
    );
    this.paso.set(5);
  }

  otra() {
    this.paso.set(1);
    this.servicioId.set(null);
    this.estilistaId.set(null);
    this.hora.set(null);
    this.cita.set(null);
    this.nombre = '';
    this.telefono = '';
  }
}
