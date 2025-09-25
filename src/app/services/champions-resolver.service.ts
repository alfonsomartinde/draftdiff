import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { Resolve } from '@angular/router';
import { ChampionsFacade } from './champions-facade.service';
import { filter, first, tap, timeout, catchError } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class ChampionsResolver implements Resolve<boolean> {
  private readonly platformId = inject(PLATFORM_ID);
  constructor(private readonly champions: ChampionsFacade) {}

  resolve(): Observable<boolean> {
    // En SSR, no bloqueamos la renderización; devolvemos true y dejamos que SSR prefetch/cliente hidrate
    if (!isPlatformBrowser(this.platformId)) return of(true);
    return this.champions.status$.pipe(
      tap((s) => { if (s === 'idle') this.champions.load(); }),
      filter((s) => s === 'success'),
      timeout(5000),
      first(),
      catchError(() => of(true)),
      tap(() => true),
    ) as unknown as Observable<boolean>;
  }
}


