import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

/**
 * Provides HttpClient and HttpClientTesting together.
 * Usage in TestBed providers: ...provideHttpTesting()
 */
export function provideHttpTesting(): any[] {
  return [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()];
}


