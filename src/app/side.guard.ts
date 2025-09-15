import { Route, UrlSegment } from '@angular/router';

export function validSideMatch(route: Route, segments: UrlSegment[]): boolean {
  const last = segments[segments.length - 1]?.path;
  return last === 'blue' || last === 'red';
}
