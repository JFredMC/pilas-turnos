import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TurnosStore } from '../core/turnos.store';
import { enlaceWhatsapp, formatoCop } from '../core/calculos';
import { Cita, Cupo } from '../core/modelos';
import { QrSimulado } from './qr-simulado';

@Component({
  selector: 'app-reserva',
  imports: [FormsModule, QrSimulado],
  templateUrl: './reserva.html',
})
export class Reserva implements OnInit {
  protected readonly store = inject(TurnosStore);
  protected readonly cop = formatoCop;
  protected readonly paso = signal(1);
  protected readonly servicioId = signal<string | null>(null);
  protected readonly estilistaId = signal<string | null>(null);
  protected readonly cupo = signal<Cupo | null>(null);
  protected readonly horarios = signal<Cupo[]>([]);
  protected readonly cargando = signal(false);
  /** Próximos 7 días, en hora de Colombia. */
  protected readonly dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - 5 * 3_600_000 + i * 86_400_000);
    const fecha = d.toISOString().slice(0, 10);
    const nombre =
      i === 0
        ? 'Hoy'
        : i === 1
          ? 'Mañana'
          : d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
    return { fecha, nombre };
  });
  protected readonly dia = signal(this.dias[0]);
  protected nombre = '';
  protected telefono = '';
  protected readonly pagarAbono = signal(true);
  protected readonly acepta = signal(false);
  protected readonly cita = signal<Cita | null>(null);

  protected readonly servicio = computed(() => this.store.servicio(this.servicioId() ?? ''));
  protected readonly estilista = computed(() => this.store.estilista(this.estilistaId() ?? ''));
  protected readonly whatsapp = computed(() => {
    const c = this.cita(),
      s = this.servicio(),
      e = this.estilista();
    if (!c || !s || !e) return '#';
    return enlaceWhatsapp(
      `¡Hola! Separé mi turno en ${this.store.salonNombre()}: ${s.nombre} con ${e.nombre}, ${this.dia().nombre.toLowerCase()} a las ${c.hora}. ` +
        (c.codigo ? `Código: ${c.codigo}. ` : '') +
        (c.abono ? `Aboné ${formatoCop(c.abono)} por Nequi.` : 'Pago todo en el salón.'),
    );
  });

  ngOnInit() {
    void this.store.cargarSalonPublico();
  }

  elegirServicio(id: string) {
    this.servicioId.set(id);
    this.cupo.set(null);
    this.paso.set(2);
  }
  async elegirEstilista(id: string) {
    this.estilistaId.set(id);
    this.cupo.set(null);
    this.paso.set(3);
    await this.cargarCupos();
  }
  async elegirDia(d: { fecha: string; nombre: string }) {
    this.dia.set(d);
    await this.cargarCupos();
  }
  private async cargarCupos() {
    this.cargando.set(true);
    this.horarios.set(
      await this.store.cupos(this.servicioId() ?? '', this.estilistaId() ?? '', this.dia().fecha),
    );
    this.cargando.set(false);
  }
  elegirHora(c: Cupo) {
    this.cupo.set(c);
    this.paso.set(4);
  }
  atras() {
    this.paso.update((p) => Math.max(1, p - 1));
  }

  async confirmar() {
    const s = this.servicio(),
      e = this.estilistaId(),
      c = this.cupo();
    if (!s || !e || !c || !this.nombre.trim() || !this.acepta()) return;
    this.cargando.set(true);
    const cita = await this.store.reservar({
      clienta: this.nombre.trim(),
      telefono: this.telefono,
      servicioId: s.id,
      estilistaId: e,
      cupo: c,
      abonar: this.pagarAbono() && this.store.abonoCop() > 0,
    });
    this.cargando.set(false);
    if (!cita) return;
    this.cita.set(cita);
    this.paso.set(5);
  }

  otra() {
    this.paso.set(1);
    this.servicioId.set(null);
    this.estilistaId.set(null);
    this.acepta.set(false);
    this.cupo.set(null);
    this.cita.set(null);
    this.nombre = '';
    this.telefono = '';
  }
}
