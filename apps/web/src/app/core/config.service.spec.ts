import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTORNO } from './entorno';
import { ConfigService } from './config.service';
import { Configuracion } from '../features/configuracion';

const original = ENTORNO.apiUrl;
afterEach(() => {
  (ENTORNO as { apiUrl: string }).apiUrl = original;
  vi.unstubAllGlobals();
});

describe('Configuración sin API', () => {
  it('muestra el aviso de que necesita la API', () => {
    const f = TestBed.createComponent(Configuracion);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('necesita la API');
  });
});

describe('ConfigService con API', () => {
  beforeEach(() => {
    (ENTORNO as { apiUrl: string }).apiUrl = 'https://api.ejemplo.invalid';
  });

  it('invita y devuelve la contraseña temporal; recarga el equipo', async () => {
    const llamadas: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        llamadas.push(`${init?.method} ${url.replace('https://api.ejemplo.invalid/api', '')}`);
        if (init?.method === 'POST')
          return new Response(
            JSON.stringify({ email: 'k@e.co', passwordTemporal: 'abcDEF234xyz' }),
            { status: 201 },
          );
        return new Response(
          JSON.stringify([
            {
              id: '1',
              nombre: 'Kelly',
              email: 'k@e.co',
              rol: 'estilista',
              estilistaId: 'e',
              debeCambiarPassword: true,
            },
          ]),
          { status: 200 },
        );
      }),
    );
    const c = TestBed.inject(ConfigService);
    const r = await c.invitar({ nombre: 'Kelly', email: 'k@e.co', estilistaId: 'e' });
    expect(r?.passwordTemporal).toBe('abcDEF234xyz');
    expect(c.usuarios()[0].debeCambiarPassword).toBe(true);
    expect(llamadas).toEqual(['POST /config/usuarios', 'GET /config/usuarios']);
  });

  it('muestra el error de la API en español', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'Ese enlace ya lo usa otro salón' }), {
            status: 409,
          }),
      ),
    );
    const c = TestBed.inject(ConfigService);
    await c.guardarSalon({ slug: 'otro' });
    expect(c.error()).toBe('Ese enlace ya lo usa otro salón');
  });
});
