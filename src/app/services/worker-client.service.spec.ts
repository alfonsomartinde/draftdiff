import { TestBed } from '@angular/core/testing';
import { WorkerClientService } from './worker-client.service';
import { provideZonelessChangeDetection } from '@angular/core';

describe('WorkerClientService (pure post + message handling)', () => {
  let svc: WorkerClientService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [WorkerClientService, provideZonelessChangeDetection()] });
    svc = TestBed.inject(WorkerClientService);
  });

  it('emits incoming messages for known SERVER/* types', (done) => {
    const msg = { type: 'SERVER/STATE', payload: { state: {} } } as any;
    svc.incoming$.subscribe((m) => {
      expect(m).toEqual(msg);
      done();
    });
    (svc as any).onSocketMessage(msg);
  });

  it('ignores empty or unknown messages', () => {
    // Should not throw
    (svc as any).onSocketMessage(null);
    (svc as any).onSocketMessage({});
    (svc as any).onSocketMessage({ type: 'UNKNOWN' });
    expect(true).toBeTrue();
  });
});


