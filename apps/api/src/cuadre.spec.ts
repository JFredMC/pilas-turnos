import { describe, expect, it } from 'vitest';
import { calcularCuadre } from './cuadre';

describe('calcularCuadre', () => {
  it('calcula comisión, propinas y medios por estilista', () => {
    const [f] = calcularCuadre(
      [{ id: 'a', nombre: 'Ana', comisionPct: 40 }],
      [
        { estilistaId: 'a', precio: 25000 },
        { estilistaId: 'a', precio: 15000 },
      ],
      [
        { estilistaId: 'a', tipo: 'abono', medio: 'nequi', monto: 5000 },
        { estilistaId: 'a', tipo: 'saldo', medio: 'efectivo', monto: 35000 },
        { estilistaId: 'a', tipo: 'propina', medio: 'efectivo', monto: 2000 },
      ],
    );
    expect(f).toMatchObject({
      servicios: 2,
      ventas: 40000,
      comision: 16000,
      propinas: 2000,
      efectivo: 37000,
      nequi: 5000,
      aPagar: 18000,
    });
  });
});
