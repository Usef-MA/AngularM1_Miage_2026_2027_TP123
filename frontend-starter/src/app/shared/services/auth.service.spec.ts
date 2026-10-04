import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('login() utilise POST /api/auth/login avec le bon corps et stocke le token', () => {
    const user = { id: 'u1', name: 'Demo', email: 'demo@example.com' };

    service.login('demo@example.com', 'Demo1234!').subscribe();

    const request = http.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'demo@example.com', password: 'Demo1234!' });

    // Faux token : le test ne dépend ni du backend ni de MongoDB.
    request.flush({ token: 'faux-token', user });

    expect(service.token()).toBe('faux-token');
    expect(service.currentUser()).toEqual(user);
    expect(localStorage.getItem('gpc_token')).toBe('faux-token');
  });
});
