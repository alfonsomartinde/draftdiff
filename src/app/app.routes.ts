import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('@pages/lobby-page/lobby-page.component').then((m) => m.LobbyPageComponent),
  },
  {
    path: 'lobby',
    loadComponent: () =>
      import('@pages/lobby-page/lobby-page.component').then((m) => m.LobbyPageComponent),
  },
  {
    path: ':roomId/red',
    loadComponent: () =>
      import('@pages/draft-page/draft-page.component').then((m) => m.DraftPageComponent),
    data: { side: 'red' },
  },
  {
    path: ':roomId/blue',
    loadComponent: () =>
      import('@pages/draft-page/draft-page.component').then((m) => m.DraftPageComponent),
    data: { side: 'blue' },
  },
  {
    path: ':roomId/spec',
    loadComponent: () =>
      import('@pages/spec-page/spec-page.component').then((m) => m.SpecPageComponent),
    data: { side: 'spec' },
  },
  { path: '**', redirectTo: '' },
];
