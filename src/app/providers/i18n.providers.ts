import { importProvidersFrom, provideAppInitializer, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TranslateLoader, TranslateModule, TranslateService } from '@ngx-translate/core';
import { TranslateHttpLoader, TRANSLATE_HTTP_LOADER_CONFIG } from '@ngx-translate/http-loader';

// UseClass lets Angular DI construct TranslateHttpLoader and inject HttpClient correctly

/**
 * Provides i18n support using ngx-translate with HTTP JSON files.
 *
 * - Default and fallback language: 'en'
 * - Files served from /assets/i18n/*.json (configured in angular.json assets)
 * - Skips activation on SSR to avoid blocking prerender
 */
export function provideI18n() {
  return [
    importProvidersFrom(
      TranslateModule.forRoot({
        fallbackLang: 'en',
        loader: {
          provide: TranslateLoader,
          useClass: TranslateHttpLoader,
        },
      }),
    ),
    {
      provide: TRANSLATE_HTTP_LOADER_CONFIG,
      useFactory: () => ({
        http: inject(HttpClient),
        prefix: '/assets/i18n/',
        suffix: '.json',
      }),
    },
    provideAppInitializer(() => {
      // Evita ejecutar en SSR para no bloquear el prerender
      if (typeof window === 'undefined') return;
      const translate = inject(TranslateService);
      translate.use('en');
    }),
  ];
}
