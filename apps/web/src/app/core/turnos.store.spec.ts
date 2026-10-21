import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TurnosStore } from './turnos.store';

describe('TurnosStore sin API (vista previa)', () => {
  it('usa los datos de ejemplo y reserva en memoria', async () => {
    const s = TestBed.inject(TurnosStore);
    expect(s.conApi).toBe(false);
    expect(s.servicios().length).toBeGreaterThan(0);
    const cupos = await s.cupos('corte-dama', 'kelly');
    expect(cupos.length).toBeGreaterThan(0);
    const antes = s.citas().length;
    const c = await s.reservar({
      clienta: 'Prueba',
      telefono: '3000000000',
      servicioId: 'corte-dama',
      estilistaId: 'kelly',
      cupo: cupos[0],
      abonar: true,
    });
    expect(c?.estado).toBe('confirmada');
    expect(s.citas().length).toBe(antes + 1);
    expect(s.logueado()).toBe(true);
  });
});
