import { TestBed } from '@angular/core/testing';
import { RoomsService } from './rooms.service';
import { provideZonelessChangeDetection } from '@angular/core';

describe('RoomsService', () => {
  let svc: RoomsService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [RoomsService, provideZonelessChangeDetection()] });
    svc = TestBed.inject(RoomsService);
  });

  afterEach(() => {
    (globalThis as any).fetch = undefined;
  });

  it('createRoom posts and returns json', async () => {
    (globalThis as any).fetch = (_input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ roomId: 'r' }) } as any);
    const res = await svc.createRoom({ blueName: 'A', redName: 'B' });
    expect((res as any).roomId).toBe('r');
  });

  it('createRoom throws on non-ok response', async () => {
    (globalThis as any).fetch = () => Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('err') } as any);
    await expectAsync(svc.createRoom({ blueName: 'A', redName: 'B' })).toBeRejected();
  });
});


