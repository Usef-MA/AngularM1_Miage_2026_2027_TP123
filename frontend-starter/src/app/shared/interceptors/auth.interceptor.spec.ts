import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

/**
 * On branche le vrai intercepteur sur HttpClient, puis on regarde
 * les headers de la requête qui serait partie vers le serveur.
 */
describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  it('ajoute Authorization: Bearer <token> lorsqu’un token existe', () => {
    auth.token.set('faux-token');

    client.get('/api/users/me').subscribe();

    const request = http.expectOne('/api/users/me');
    expect(request.request.headers.get('Authorization')).toBe('Bearer faux-token');
    request.flush({});
  });

  it('n’ajoute pas de header Authorization sans token', () => {
    auth.token.set(null);

    client.get('/api/health').subscribe();

    const request = http.expectOne('/api/health');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });
});
