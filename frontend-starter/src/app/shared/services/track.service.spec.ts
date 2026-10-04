import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TrackService } from './track.service';

/**
 * HttpTestingController remplace le vrai réseau : aucune requête ne part,
 * le test inspecte la requête préparée puis fournit lui-même la réponse.
 */
describe('TrackService', () => {
  let service: TrackService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TrackService);
    http = TestBed.inject(HttpTestingController);
  });

  // Échoue si une requête inattendue a été envoyée.
  afterEach(() => http.verify());

  it('list() transmet page et limit à GET /api/tracks', () => {
    const page = { items: [], page: 2, limit: 5, total: 7, pages: 2 };
    let result: unknown;

    service.list(2, 5).subscribe((response) => (result = response));

    const request = http.expectOne((r) => r.url === '/api/tracks');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('limit')).toBe('5');

    request.flush(page);
    expect(result).toEqual(page);
  });

  it('remove() envoie DELETE /api/tracks/:id', () => {
    let done = false;

    service.remove('abc123').subscribe(() => (done = true));

    const request = http.expectOne('/api/tracks/abc123');
    expect(request.request.method).toBe('DELETE');

    // Le backend répond 204 : aucun corps.
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });
});
