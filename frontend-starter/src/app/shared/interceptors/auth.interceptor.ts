import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Routes où un 401 signifie « identifiants incorrects » et non « session expirée ». */
const PUBLIC_AUTH_URLS = ['/api/auth/login', '/api/auth/register'];

/**
 * Adds the bearer token to protected API requests and handles 401 globally:
 * an invalid or expired token clears the session and redirects to /login.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();

  const authorizedRequest = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorizedRequest).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !PUBLIC_AUTH_URLS.includes(request.url)
      ) {
        console.warn('[AuthInterceptor] 401 reçu : session expirée, retour à /login');
        auth.logout();
        void router.navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};
