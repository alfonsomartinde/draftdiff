import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Rutas con parámetros: SSR para evitar requisitos de getPrerenderParams
  // SSR activo; los datos se precargan de forma no bloqueante
  { path: ':roomId/blue', renderMode: RenderMode.Server },
  { path: ':roomId/red', renderMode: RenderMode.Server },
  { path: ':roomId/spec', renderMode: RenderMode.Server },
  // Página inicial: SSR (desactivamos prerender para evitar NG0201 durante extracción)
  { path: '', renderMode: RenderMode.Server },
  // Fallback: SSR por defecto
  { path: '**', renderMode: RenderMode.Server },
];
