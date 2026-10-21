import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { TurnosStore } from './core/turnos.store';
import { api } from './core/api';

/** Con API, el panel del salón pide login. Sin API (datos de ejemplo) queda abierto. */
const conSesion: CanActivateFn = (_r, estado) => {
  const router = inject(Router);
  if (!inject(TurnosStore).logueado())
    return router.createUrlTree(['/salon/ingresar'], { queryParams: { volver: estado.url } });
  // Contraseña temporal: primero debe cambiarla.
  return !api.cambioPendiente() || router.createUrlTree(['/salon/cambiar-clave']);
};
/** Configuración: solo la dueña. */
const soloDuena: CanActivateFn = () =>
  inject(TurnosStore).rol() === 'duena' || inject(Router).createUrlTree(['/salon/agenda']);
const conToken: CanActivateFn = () =>
  inject(TurnosStore).logueado() || inject(Router).createUrlTree(['/salon/ingresar']);

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
  {
    path: 'salon/configuracion',
    canActivate: [conSesion, soloDuena],
    title: 'Configuración · Pilas',
    loadComponent: () => import('./features/configuracion').then((m) => m.Configuracion),
  },
  {
    path: 'salon/cambiar-clave',
    canActivate: [conToken],
    title: 'Cambiar contraseña · Pilas',
    loadComponent: () => import('./features/clave').then((m) => m.CambiarClave),
  },
  {
    path: 'salon/recuperar',
    title: 'Recuperar contraseña · Pilas',
    loadComponent: () => import('./features/clave').then((m) => m.Recuperar),
  },
  {
    path: 'salon/restablecer',
    title: 'Contraseña nueva · Pilas',
    loadComponent: () => import('./features/clave').then((m) => m.Restablecer),
  },
  { path: '**', redirectTo: '' },
];
