import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTORNO } from './entorno';
import { TurnosStore } from './turnos.store';

const original = ENTORNO.apiUrl;
beforeEach(() => {
  (ENTORNO as { apiUrl: string }).apiUrl = 'https://api.ejemplo.invalid';
});
afterEach(() => {
  (ENTORNO as { apiUrl: string }).apiUrl = original;
  vi.unstubAllGlobals();
});

describe('TurnosStore con API dormida o caída', () => {
  it('si la API no responde, cambia a datos de ejemplo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red')));
    const s = TestBed.inject(TurnosStore);
    expect(s.conApi).toBe(true);
    expect(await s.despertar(50)).toBe(false);
    expect(s.conApi).toBe(false);
    expect(s.estadoApi()).toBe('sin-conexion');
    expect(s.servicios().length).toBeGreaterThan(0);
  });

  it('si el salón no existe en la API, también usa datos de ejemplo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/api/health')
          ? new Response('{"ok":true}', { status: 200 })
          : new Response('{"message":"Salón no encontrado"}', { status: 404 }),
      ),
    );
    const s = TestBed.inject(TurnosStore);
    await s.cargarSalonPublico();
    expect(s.conApi).toBe(false);
    expect(s.servicios().length).toBeGreaterThan(0);
  });

  it('cuando despierta, queda en modo API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })));
    const s = TestBed.inject(TurnosStore);
    expect(await s.despertar(1000)).toBe(true);
    expect(s.estadoApi()).toBe('listo');
    expect(s.conApi).toBe(true);
  });
});
