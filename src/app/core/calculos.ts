import { Cita, Estilista, Servicio } from './modelos';

export const formatoCop = (v: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(v);

export const aMinutos = (hora: string): number => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};
export const aHora = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Horarios libres (cada 30 min) de una estilista para un servicio de cierta duración. */
export function horariosLibres(
  citas: Cita[],
  servicios: Servicio[],
  estilistaId: string,
  duracion: number,
  apertura: number,
  cierre: number,
): string[] {
  const ocupados = citas
    .filter((c) => c.estilistaId === estilistaId && c.estado !== 'no-llego')
    .map((c) => {
      const ini = aMinutos(c.hora);
      const dur = servicios.find((s) => s.id === c.servicioId)?.minutos ?? 30;
      return [ini, ini + dur] as const;
    });
  const libres: string[] = [];
  for (let t = apertura * 60; t + duracion <= cierre * 60; t += 30) {
    const choca = ocupados.some(([a, b]) => t < b && t + duracion > a);
    if (!choca) libres.push(aHora(t));
  }
  return libres;
}

export interface CuadreEstilista {
  estilista: Estilista;
  servicios: number;
  ventas: number;
  comision: number;
  propinas: number;
  efectivo: number;
  nequi: number;
  /** Lo que se le paga a la estilista: comisión + propinas. */
  aPagar: number;
}

/** Cuadre de caja diario por estilista con las citas atendidas. */
export function cuadrePorEstilista(
  citas: Cita[],
  servicios: Servicio[],
  estilistas: Estilista[],
): CuadreEstilista[] {
  return estilistas.map((e) => {
    const suyas = citas.filter((c) => c.estilistaId === e.id && c.estado === 'atendida');
    let ventas = 0,
      propinas = 0,
      efectivo = 0,
      nequi = 0;
    for (const c of suyas) {
      const precio = servicios.find((s) => s.id === c.servicioId)?.precio ?? 0;
      const propina = c.propina ?? 0;
      ventas += precio;
      propinas += propina;
      // El abono siempre entra por Nequi; el saldo + propina por el medio elegido.
      nequi += c.abono;
      const resto = precio - c.abono + propina;
      if (c.pago === 'nequi') nequi += resto;
      else efectivo += resto;
    }
    const comision = Math.round(ventas * e.comision);
    return {
      estilista: e,
      servicios: suyas.length,
      ventas,
      comision,
      propinas,
      efectivo,
      nequi,
      aPagar: comision + propinas,
    };
  });
}

/** Mensaje y enlace para compartir la cita por WhatsApp. */
export function enlaceWhatsapp(texto: string, telefono?: string): string {
  const destino = telefono ? `57${telefono.replace(/\D/g, '')}` : '';
  return `https://wa.me/${destino}?text=${encodeURIComponent(texto)}`;
}
