import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type Tema = 'light' | 'dark';
const CLAVE = 'pilas-tema';

/** Tema claro/oscuro de un toque, persistente en localStorage (igual que en Cuadre). */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  readonly tema = signal<Tema>(this.inicial());

  constructor() {
    this.aplicar(this.tema());
  }

  alternar(): void {
    const siguiente: Tema = this.tema() === 'dark' ? 'light' : 'dark';
    this.tema.set(siguiente);
    this.aplicar(siguiente);
    try {
      localStorage.setItem(CLAVE, siguiente);
    } catch {
      /* almacenamiento no disponible */
    }
  }

  private inicial(): Tema {
    try {
      const guardado = localStorage.getItem(CLAVE);
      if (guardado === 'light' || guardado === 'dark') return guardado;
    } catch {
      /* sin acceso */
    }
    const win = this.doc.defaultView;
    return win?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private aplicar(t: Tema): void {
    this.doc.documentElement.setAttribute('data-theme', t);
  }
}
