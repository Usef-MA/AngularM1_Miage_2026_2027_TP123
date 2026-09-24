import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  // inject() récupère un service déjà enregistré par Angular, sans passer
  // par un constructeur. AuthService expose le signal `token()` : le
  // template s'en sert pour savoir si un utilisateur est connecté.
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /**
   * Déconnecte l'utilisateur.
   * AuthService.logout() vide le token et le profil (localStorage +
   * signals) ; on renvoie ensuite l'utilisateur vers la page de connexion.
   */
  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
