import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Separa tu turno · Pilas',
    loadComponent: () => import('./features/reserva').then((m) => m.Reserva),
  },
  {
    path: 'salon/agenda',
    title: 'Agenda · Pilas',
    loadComponent: () => import('./features/agenda').then((m) => m.Agenda),
  },
  {
    path: 'salon/espera',
    title: 'Lista de espera · Pilas',
    loadComponent: () => import('./features/espera').then((m) => m.EsperaPage),
  },
  {
    path: 'salon/caja',
    title: 'Cuadre de caja · Pilas',
    loadComponent: () => import('./features/caja').then((m) => m.Caja),
  },
  { path: '**', redirectTo: '' },
];
