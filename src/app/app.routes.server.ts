import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Rutas con parámetros: SSR para evitar requisitos de getPrerenderParams
  { path: ':roomId/blue', renderMode: RenderMode.Server },
  { path: ':roomId/red', renderMode: RenderMode.Server },
  { path: ':roomId/spec', renderMode: RenderMode.Server },
  // Página inicial: Prerender para mejor LCP
  { path: '', renderMode: RenderMode.Prerender },
  // Fallback: SSR por defecto
  { path: '**', renderMode: RenderMode.Server },
];
