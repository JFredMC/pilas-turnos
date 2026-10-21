import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { TurnosStore } from './core/turnos.store';

/** Con API, el panel del salón pide login. Sin API (datos de ejemplo) queda abierto. */
const conSesion: CanActivateFn = (_r, estado) =>
  inject(TurnosStore).logueado() ||
  inject(Router).createUrlTree(['/salon/ingresar'], { queryParams: { volver: estado.url } });

export const routes: Routes = [
  {
    path: '',
    title: 'Separa tu turno · Pilas',
    loadComponent: () => import('./features/reserva').then((m) => m.Reserva),
  },
  {
    path: 'salon/ingresar',
    title: 'Ingresar · Pilas',
    loadComponent: () => import('./features/ingresar').then((m) => m.Ingresar),
  },
  {
    path: 'salon/agenda',
    canActivate: [conSesion],
    title: 'Agenda · Pilas',
    loadComponent: () => import('./features/agenda').then((m) => m.Agenda),
  },
  {
    path: 'salon/espera',
    canActivate: [conSesion],
    title: 'Lista de espera · Pilas',
    loadComponent: () => import('./features/espera').then((m) => m.EsperaPage),
  },
  {
    path: 'salon/caja',
    canActivate: [conSesion],
    title: 'Cuadre de caja · Pilas',
    loadComponent: () => import('./features/caja').then((m) => m.Caja),
  },
  { path: '**', redirectTo: '' },
];
