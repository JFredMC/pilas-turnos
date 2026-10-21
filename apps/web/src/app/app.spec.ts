import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('alterna el tema con un toque y lo guarda', () => {
    const f = TestBed.createComponent(App);
    f.detectChanges();
    const btn = f.nativeElement.querySelector(
      'button[aria-label="Modo oscuro"]',
    ) as HTMLButtonElement;
    const antes = document.documentElement.getAttribute('data-theme');
    btn.click();
    f.detectChanges();
    const despues = document.documentElement.getAttribute('data-theme');
    expect(despues).not.toBe(antes);
    expect(localStorage.getItem('pilas-tema')).toBe(despues);
  });

  it('abre y cierra el menú móvil', () => {
    const f = TestBed.createComponent(App);
    f.detectChanges();
    const btn = f.nativeElement.querySelector('button[aria-label="Menú"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click();
    f.detectChanges();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });
});
