import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService, EstilistaConfig, Franja, ServicioConfig } from '../core/config.service';
import { formatoCop } from '../core/calculos';
import { api } from '../core/api';

type Pestana = 'salon' | 'servicios' | 'estilistas' | 'horarios' | 'equipo';
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
/** Orden de la semana en Colombia: lunes primero. */
const ORDEN = [1, 2, 3, 4, 5, 6, 0];

@Component({
  selector: 'app-configuracion',
  imports: [FormsModule],
  templateUrl: './configuracion.html',
})
export class Configuracion implements OnInit {
  protected readonly cfg = inject(ConfigService);
  protected readonly cop = formatoCop;
  protected readonly conApi = api.activa();
  protected readonly dias = DIAS;
  protected readonly orden = ORDEN;
  protected readonly pestana = signal<Pestana>('salon');
  protected readonly pestanas: { id: Pestana; texto: string }[] = [
    { id: 'salon', texto: 'Salón' },
    { id: 'servicios', texto: 'Servicios' },
    { id: 'estilistas', texto: 'Estilistas' },
    { id: 'horarios', texto: 'Horarios' },
    { id: 'equipo', texto: 'Equipo' },
  ];

  // Salón
  protected salon = {
    nombre: '',
    slug: '',
    ciudad: '',
    whatsapp: '',
    nequiNumero: '',
    abonoActivo: true,
    abonoCop: 5000,
  };

  // Servicios
  protected nuevoServicio = { nombre: '', minutos: 30, precio: 20000 };
  protected readonly editandoServicio = signal<string | null>(null);
  protected edicionServicio = { nombre: '', minutos: 30, precio: 0 };

  // Estilistas
  protected nuevaEstilista = { nombre: '', comisionPct: 50 };

  // Horarios
  protected readonly estilistaHorario = signal<string>('');
  protected semana: { dia: number; atiende: boolean; abre: string; cierra: string }[] = [];
  protected excepcion = {
    estilistaId: '',
    fecha: '',
    cerrado: true,
    abre: '09:00',
    cierra: '13:00',
    motivo: '',
  };

  // Equipo
  protected invitacion = { nombre: '', email: '', estilistaId: '' };
  protected readonly temporal = signal<{ email: string; clave: string } | null>(null);

  constructor() {
    effect(() => {
      const s = this.cfg.salon();
      if (s)
        this.salon = {
          nombre: s.nombre,
          slug: s.slug,
          ciudad: s.ciudad,
          whatsapp: s.whatsapp ?? '',
          nequiNumero: s.nequiNumero ?? '',
          abonoActivo: s.abonoActivo,
          abonoCop: s.abonoCop,
        };
    });
    effect(() => {
      const lista = this.cfg.estilistas();
      if (!this.estilistaHorario() && lista.length) this.estilistaHorario.set(lista[0].id);
      const e = lista.find((x) => x.id === this.estilistaHorario());
      if (e) this.semana = this.aSemana(e);
    });
  }

  ngOnInit() {
    void this.cfg.cargarTodo();
  }

  nombreEstilista(id: string | null) {
    return id
      ? (this.cfg.estilistas().find((e) => e.id === id)?.nombre ?? 'Estilista')
      : 'Todo el salón';
  }

  // ---------- Salón ----------
  guardarSalon() {
    const s = this.salon;
    void this.cfg.guardarSalon({
      nombre: s.nombre,
      slug: s.slug,
      ciudad: s.ciudad,
      whatsapp: s.whatsapp.trim() || null,
      nequiNumero: s.nequiNumero.trim() || null,
      abonoActivo: s.abonoActivo,
      abonoCop: s.abonoActivo ? Number(s.abonoCop) : 0,
    });
  }

  subirQr(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) void this.cfg.subirQr(f).finally(() => (input.value = ''));
  }

  // ---------- Servicios ----------
  async crearServicio() {
    const n = this.nuevoServicio;
    if (
      (await this.cfg.crearServicio({
        nombre: n.nombre,
        minutos: Number(n.minutos),
        precio: Number(n.precio),
      })) !== undefined
    ) {
      this.nuevoServicio = { nombre: '', minutos: 30, precio: 20000 };
    }
  }
  editarServicio(s: ServicioConfig) {
    this.editandoServicio.set(s.id);
    this.edicionServicio = { nombre: s.nombre, minutos: s.minutos, precio: s.precio };
  }
  async guardarServicio(id: string) {
    const e = this.edicionServicio;
    if (
      (await this.cfg.editarServicio(id, {
        nombre: e.nombre,
        minutos: Number(e.minutos),
        precio: Number(e.precio),
      })) !== undefined
    )
      this.editandoServicio.set(null);
  }
  borrarServicio(s: ServicioConfig) {
    if (confirm(`¿Borrar "${s.nombre}"? Si ya tiene citas, solo se desactiva.`))
      void this.cfg.borrarServicio(s.id);
  }

  // ---------- Estilistas ----------
  async crearEstilista() {
    const n = this.nuevaEstilista;
    if (
      (await this.cfg.crearEstilista({ nombre: n.nombre, comisionPct: Number(n.comisionPct) })) !==
      undefined
    )
      this.nuevaEstilista = { nombre: '', comisionPct: 50 };
  }
  cambiarComision(e: EstilistaConfig, valor: string) {
    const pct = Math.round(Number(valor));
    if (Number.isFinite(pct) && pct !== e.comisionPct)
      void this.cfg.editarEstilista(e.id, { comisionPct: pct });
  }

  // ---------- Horarios ----------
  private aSemana(e: EstilistaConfig) {
    return ORDEN.map((dia) => {
      const f = e.horario.find((h) => h.diaSemana === dia);
      return { dia, atiende: !!f, abre: f?.abre ?? '08:00', cierra: f?.cierra ?? '18:00' };
    });
  }
  elegirEstilistaHorario(id: string) {
    this.estilistaHorario.set(id);
    const e = this.cfg.estilistas().find((x) => x.id === id);
    if (e) this.semana = this.aSemana(e);
  }
  guardarHorario() {
    const franjas: Franja[] = this.semana
      .filter((d) => d.atiende)
      .map((d) => ({ diaSemana: d.dia, abre: d.abre, cierra: d.cierra }));
    void this.cfg.guardarHorario(this.estilistaHorario(), franjas);
  }
  async crearExcepcion() {
    const x = this.excepcion;
    const ok = await this.cfg.crearExcepcion({
      estilistaId: x.estilistaId || null,
      fecha: x.fecha,
      cerrado: x.cerrado,
      ...(x.cerrado ? {} : { abre: x.abre, cierra: x.cierra }),
      motivo: x.motivo || undefined,
    });
    if (ok !== undefined) this.excepcion = { ...this.excepcion, fecha: '', motivo: '' };
  }

  // ---------- Equipo ----------
  async invitar() {
    const r = await this.cfg.invitar({ ...this.invitacion, email: this.invitacion.email.trim() });
    if (r) {
      this.temporal.set({ email: r.email, clave: r.passwordTemporal });
      this.invitacion = { nombre: '', email: '', estilistaId: '' };
    }
  }
  async restablecer(id: string, email: string) {
    if (!confirm('¿Generar una contraseña temporal nueva? Se cerrarán sus sesiones abiertas.'))
      return;
    const r = await this.cfg.restablecerUsuario(id);
    if (r) this.temporal.set({ email, clave: r.passwordTemporal });
  }
  borrarUsuario(id: string, nombre: string) {
    if (confirm(`¿Quitarle el acceso a ${nombre}?`)) void this.cfg.borrarUsuario(id);
  }
  async copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      this.cfg.ok.set('Copiado.');
    } catch {
      /* sin portapapeles */
    }
  }
}
