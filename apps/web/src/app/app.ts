import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TurnosStore } from './core/turnos.store';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  host: { '(document:keydown.escape)': 'menu.set(false)' },
})
export class App {
  protected readonly theme = inject(ThemeService);
  protected readonly menu = signal(false);
  protected readonly store = inject(TurnosStore);
  private readonly router = inject(Router);
  constructor() {
    // Despierta la API (Render Free) apenas abre la app, sin bloquear la pantalla.
    void this.store.despertar();
  }
  salir() {
    this.store.salir();
    this.menu.set(false);
    void this.router.navigateByUrl('/salon/ingresar');
  }
  protected readonly enlaces: { ruta: string; texto: string; soloDuena?: boolean }[] = [
    { ruta: '/', texto: 'Reservar (clienta)' },
    { ruta: '/salon/agenda', texto: 'Agenda' },
    { ruta: '/salon/espera', texto: 'Lista de espera' },
    { ruta: '/salon/caja', texto: 'Cuadre de caja' },
    { ruta: '/salon/configuracion', texto: 'Configuración', soloDuena: true },
  ];
}
