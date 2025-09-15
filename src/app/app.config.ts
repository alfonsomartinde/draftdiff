import {
  isDevMode,
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { draftReducer } from '@app/state/draft/draft.reducer';
import { championsReducer } from '@app/state/champions/champions.reducer';
import { provideRouter } from '@angular/router';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideI18n } from '@providers/i18n.providers';
import { DraftEffects } from '@state/draft/draft.effects';
import { ChampionsEffects } from '@state/champions/champions.effects';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    ...provideI18n(),
    provideStore({
      draft: draftReducer,
      champions: championsReducer,
    }),
    // Devtools only in dev to avoid SSR/provider issues in production builds
    ...(isDevMode()
      ? [
          provideStoreDevtools({
            maxAge: 25,
            logOnly: !isDevMode(),
            autoPause: true,
            trace: false,
            traceLimit: 75,
            connectInZone: true,
          }),
        ]
      : []),
    provideEffects(DraftEffects),
    provideEffects(ChampionsEffects),
    provideClientHydration(withEventReplay()),
  ],
};
