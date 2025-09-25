import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { inject, TransferState } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Title } from '@angular/platform-browser';
import { PlatformLocation } from '@angular/common';
import { RiotService } from '@services/riot.service';
import { CHAMPIONS_TSTATE_KEY } from '@services/transfer-keys';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    {
      provide: 'APP_SSR_PREFETCH',
      multi: true,
      useFactory: () => {
        const riot = inject(RiotService);
        const transferState = inject(TransferState);
        return async () => {
          try {
            const items = await riot.getChampions();
            transferState.set(CHAMPIONS_TSTATE_KEY, items);
          } catch {}
        };
      },
    },
    {
      // Minimal i18n boot on SSR to set the initial <title> usando ruta (blue/red/spec)
      provide: 'APP_SSR_TITLE',
      multi: true,
      useFactory: () => {
        const translate = inject(TranslateService);
        const title = inject(Title);
        const platformLocation = inject(PlatformLocation) as any;
        return () => {
          try {
            // Diccionario mínimo en memoria para SSR
            translate.setTranslation(
              'en',
              {
                app: { title: 'Draft Diff' },
                common: {
                  spectator: 'Spectator',
                  blueSide: 'Blue side',
                  redSide: 'Red side',
                },
              },
              true,
            );
            translate.use('en');

            const url: string = platformLocation?.pathname || '';
            let suffix = '';
            if (/\/blue(\/?|$)/.test(url)) suffix = translate.instant('common.blueSide');
            else if (/\/red(\/?|$)/.test(url)) suffix = translate.instant('common.redSide');
            else if (/\/spec(\/?|$)/.test(url)) suffix = translate.instant('common.spectator');

            const base = translate.instant('app.title');
            title.setTitle(suffix ? `${base} - ${suffix}` : base);
          } catch {}
        };
      },
    },
  ],
};

export const appConfigServer = mergeApplicationConfig(appConfig, serverConfig);
