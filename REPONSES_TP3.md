# Réponses TP3 — Fiabilisation et enrichissement du frontend

## Où on en est (dernière mise à jour : 04/10/2026)

- [x] Mission 5 — suppression : bouton 🗑 par card, `confirm()`, état `deletingId` (anti double-clic), SnackBar Angular Material, rechargement, gestion du `404`. Testé OK.
- [x] Captures suppression : `screenshots/tp3/delete-204.png` (DELETE → 204 puis rechargement) et `screenshots/tp3/delete-404.png` (piste supprimée dans un autre onglet → 404 + SnackBar).
- [ ] Mission 6 — progression de l'upload (événements HTTP, pourcentage, états).
- [ ] Capture Network d'un upload avec progression.
- [ ] Mission 7 — au moins 3 tests frontend (Vitest) + rapport des tests (attendu / observé).
- [ ] `npm run build` final.
- [ ] Rapport IA fondé sur `RAPPORT_IA_MODELE.md`.

## Mission 5 — Suppression

### Flux

```text
Clic 🗑 → TracksPageComponent.remove(track) → confirm()
  → TrackService.remove(id) → HttpClient → DELETE /api/tracks/:id (JWT ajouté par auth.interceptor.ts)
    → Express : auth → Track.findOneAndDelete({ _id, ownerId }) → suppression du fichier sur le disque
    ← 204 No Content   ou   404 { message: "Piste inconnue" }
  → SnackBar + load() (si la page devient vide, retour à la dernière page existante)
```

| Élément | Fichier / méthode |
|---|---|
| Appel HTTP | `track.service.ts` → `remove(id)` (le composant n'utilise jamais `HttpClient` directement) |
| Confirmation, anti double-clic, messages | `tracks-page.ts` → `remove()`, signal `deletingId`, `finalize`, `notify()` (MatSnackBar) |
| Piste supprimée en cours d'écoute | `tracks-page.ts` → `stopIfPlaying()` (révoque l'ObjectURL) |
| Page vidée après suppression | `tracks-page.ts` → `load()` recule si `items` est vide et `page > pages` |
| Contrôle backend | `backend/src/app.js` → `DELETE /api/tracks/:id` : middleware `auth` + filtre `ownerId` |

### Cas « la piste n'existe plus ou n'appartient pas à l'utilisateur »

Le backend cherche la piste avec son `_id` **et** l'`ownerId` du token. Une piste déjà supprimée (autre onglet) ou appartenant à un autre utilisateur donne donc le même résultat : `404`. Le frontend affiche « n'existe plus ou ne vous appartient pas » et recharge la liste, qui était périmée.

### Pourquoi le guard et l'interface ne suffisent pas

Le guard empêche seulement d'**afficher** la page sans token, et le bouton n'est qu'un élément d'interface. N'importe qui peut envoyer `DELETE /api/tracks/:id` avec curl ou depuis la console, sans passer par Angular. La vraie protection est côté backend : le middleware `auth` vérifie la signature du JWT (sinon `401`) et le filtre `ownerId` garantit qu'on ne supprime que ses propres pistes (sinon `404`).
