import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  protected readonly enlaces = [
    { ruta: '/', texto: 'Reservar (clienta)' },
    { ruta: '/salon/agenda', texto: 'Agenda' },
    { ruta: '/salon/espera', texto: 'Lista de espera' },
    { ruta: '/salon/caja', texto: 'Cuadre de caja' },
  ];
}
