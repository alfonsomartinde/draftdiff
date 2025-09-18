import { TestBed } from '@angular/core/testing';
import { RiotService } from './riot.service';
import { provideZonelessChangeDetection } from '@angular/core';

describe('RiotService', () => {
  let svc: RiotService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    svc = TestBed.inject(RiotService);
  });

  afterEach(() => {
    (globalThis as any).fetch = undefined;
  });

  it('fetches latest version via SSR proxy', async () => {
    (globalThis as any).fetch = (input: RequestInfo | URL) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '14.1.1' }) } as any);
    await expectAsync(svc.getLatestVersion()).toBeResolvedTo('14.1.1');
  });
});


