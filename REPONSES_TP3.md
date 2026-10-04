# Réponses TP3 — Fiabilisation et enrichissement du frontend

## Où on en est (dernière mise à jour : 04/10/2026)

- [x] Mission 5 — suppression : bouton 🗑 par card, `confirm()`, état `deletingId` (anti double-clic), SnackBar Angular Material, rechargement, gestion du `404`. Testé OK.
- [x] Captures suppression : `screenshots/tp3/delete-204.png` (DELETE → 204 puis rechargement) et `screenshots/tp3/delete-404.png` (piste supprimée dans un autre onglet → 404 + SnackBar).
- [x] Mission 6 — progression de l'upload : `withXhr()`, `reportProgress` + `observe: 'events'`, états `idle` / `uploading` / `success` / `error`, barre de progression, contrôles désactivés. Testé OK (throttling 3G).
- [x] Capture upload avec progression : `screenshots/tp3/upload-progress.png` (19 %, requête `tracks` en `pending`, type `xhr`).
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

## Mission 6 — Progression de l'upload

### Flux

```text
upload() → TrackService.upload(file, title) → http.post(..., { reportProgress: true, observe: 'events' })
  → HttpXhrBackend (withXhr) → POST /api/tracks (multipart, JWT)
  ← Sent → UploadProgress (loaded/total) × N → Response (piste créée)
  → progress.set(...) à chaque UploadProgress ; uploadState = 'success' à la Response, 'error' en cas d'échec
```

| Élément | Fichier / méthode |
|---|---|
| Moteur HTTP compatible progression | `main.ts` → `provideHttpClient(withXhr(), ...)` |
| Demande des événements | `track.service.ts` → `upload()` avec `reportProgress: true`, `observe: 'events'` |
| États et pourcentage | `tracks-page.ts` → signaux `uploadState` (`idle`, `uploading`, `success`, `error`) et `progress`, `uploading` = `computed` |
| Contrôles bloqués pendant l'envoi | `title.disable()` / `enable()` dans `finalize`, champ fichier et bouton `[disabled]="uploading()"`, garde `if (this.uploading()) return` |
| Affichage | `tracks-page.html` → `<progress [value]="progress()" max="100">` + texte « xx % » |

### Calcul du pourcentage

`Math.round(100 * event.loaded / event.total)` — octets déjà envoyés divisés par la taille totale du corps. Exemple : 3 Mo envoyés sur 6 Mo → 50 %. `total` peut être absent : on ne calcule alors rien plutôt que d'afficher une valeur fausse.

### Pourquoi `fetch` ne suffit pas

Dans Angular 22 (version du projet), `HttpClient` utilise `fetch` par défaut (colonne Type = `fetch` dans Network avant le changement). L'API `fetch` ne fournit pas d'événement de progression d'envoi : Angular lève l'erreur « The FetchBackend does not support upload progress reporting ». `withXhr()` réactive `XMLHttpRequest`, dont `xhr.upload` émet les événements `progress`.

### Pourquoi ce n'est pas une requête « normale »

Une requête classique émet **une seule valeur** (le corps de la réponse) puis se termine. Avec `observe: 'events'`, la **même** requête émet **plusieurs valeurs** de types différents (`Sent`, `UploadProgress`, `Response`…). Le `next` doit donc tester `event.type` : mettre à jour le pourcentage pour `UploadProgress`, et traiter la piste seulement pour `Response` (son `body`). Le succès n'est connu qu'au dernier événement, pas au premier `next`.
