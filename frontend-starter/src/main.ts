import { inject, provideAppInitializer } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient, withInterceptors, withXhr } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { AppComponent } from './app/components/app/app';
import { routes } from './app/routes';
import { authInterceptor } from './app/shared/interceptors/auth.interceptor';
import { AuthService } from './app/shared/services/auth.service';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    // withXhr : le backend fetch par défaut ne sait pas suivre la progression d'un upload (Mission 6).
    provideHttpClient(withXhr(), withInterceptors([authInterceptor])),
    provideAppInitializer(() => inject(AuthService).restoreSession()),
  ],
}).catch(console.error);
