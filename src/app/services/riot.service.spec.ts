import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { RiotService } from './riot.service';
import { provideHttpTesting } from 'src/test-helpers/http';

describe('RiotService', () => {
  let svc: RiotService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpTesting()]
    });
    svc = TestBed.inject(RiotService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches latest version via SSR proxy', async () => {
    const promise = svc.getLatestVersion();
    const req = httpMock.expectOne('/api/versions/latest');
    expect(req.request.method).toBe('GET');
    req.flush({ version: '14.1.1' });
    await expectAsync(promise).toBeResolvedTo('14.1.1');
  });
});


