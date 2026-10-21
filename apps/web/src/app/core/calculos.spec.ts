import { describe, expect, it } from 'vitest';
import { cuadrePorEstilista, enlaceWhatsapp, formatoCop, horariosLibres } from './calculos';
import { Cita, Estilista, Servicio } from './modelos';

const servicios: Servicio[] = [{ id: 's', nombre: 'Corte', minutos: 60, precio: 20000 }];
const est: Estilista[] = [{ id: 'a', nombre: 'Ana', comision: 0.5 }];

describe('horariosLibres', () => {
  it('excluye los horarios que se cruzan con citas', () => {
    const citas: Cita[] = [
      {
        id: '1',
        clienta: 'X',
        telefono: '',
        servicioId: 's',
        estilistaId: 'a',
        hora: '09:00',
        estado: 'confirmada',
        abono: 0,
      },
    ];
    const libres = horariosLibres(citas, servicios, 'a', 60, 8, 11);
    expect(libres).toEqual(['08:00', '10:00']);
  });
  it('libera el cupo si la clienta no llegó', () => {
    const citas: Cita[] = [
      {
        id: '1',
        clienta: 'X',
        telefono: '',
        servicioId: 's',
        estilistaId: 'a',
        hora: '09:00',
        estado: 'no-llego',
        abono: 0,
      },
    ];
    expect(horariosLibres(citas, servicios, 'a', 60, 9, 10)).toEqual(['09:00']);
  });
});

describe('cuadrePorEstilista', () => {
  it('suma comisión, propinas y separa efectivo y Nequi', () => {
    const citas: Cita[] = [
      {
        id: '1',
        clienta: 'X',
        telefono: '',
        servicioId: 's',
        estilistaId: 'a',
        hora: '08:00',
        estado: 'atendida',
        abono: 5000,
        pago: 'efectivo',
        propina: 2000,
      },
      {
        id: '2',
        clienta: 'Y',
        telefono: '',
        servicioId: 's',
        estilistaId: 'a',
        hora: '10:00',
        estado: 'atendida',
        abono: 0,
        pago: 'nequi',
      },
      {
        id: '3',
        clienta: 'Z',
        telefono: '',
        servicioId: 's',
        estilistaId: 'a',
        hora: '12:00',
        estado: 'pendiente',
        abono: 0,
      },
    ];
    const [c] = cuadrePorEstilista(citas, servicios, est);
    expect(c.servicios).toBe(2);
    expect(c.ventas).toBe(40000);
    expect(c.comision).toBe(20000);
    expect(c.propinas).toBe(2000);
    expect(c.efectivo).toBe(17000);
    expect(c.nequi).toBe(25000);
    expect(c.aPagar).toBe(22000);
  });
});

describe('utilidades', () => {
  it('formatea pesos colombianos', () => {
    expect(formatoCop(25000).replace(/\s/g, ' ')).toMatch(/25\.000/);
  });
  it('arma el enlace de WhatsApp con indicativo 57', () => {
    expect(enlaceWhatsapp('hola', '300 000 0000')).toBe('https://wa.me/573000000000?text=hola');
  });
});
