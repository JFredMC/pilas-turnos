import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TurnosStore } from '../core/turnos.store';
import { SelectorFecha } from './selector-fecha';

describe('SelectorFecha', () => {
  it('avanza y retrocede de día y vuelve a hoy', () => {
    const f = TestBed.createComponent(SelectorFecha);
    const store = TestBed.inject(TurnosStore);
    f.detectChanges();
    const hoy = store.fecha();
    (f.nativeElement.querySelector('[aria-label="Día siguiente"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(store.fecha() > hoy).toBe(true);
    expect(store.citasDelDia()).toEqual([]);
    (f.nativeElement.querySelector('.ghost') as HTMLButtonElement).click();
    expect(store.fecha()).toBe(hoy);
    expect(store.citasDelDia().length).toBeGreaterThan(0);
  });
});
