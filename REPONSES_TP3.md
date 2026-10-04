# Réponses TP3 — Fiabilisation et enrichissement du frontend

## Où on en est (dernière mise à jour : 04/10/2026)

- [x] Mission 5 — suppression : bouton 🗑 par card, `confirm()`, état `deletingId` (anti double-clic), SnackBar Angular Material, rechargement, gestion du `404`. Testé OK.
- [x] Captures suppression : `screenshots/tp3/delete-204.png` (DELETE → 204 puis rechargement) et `screenshots/tp3/delete-404.png` (piste supprimée dans un autre onglet → 404 + SnackBar).
- [x] Mission 6 — progression de l'upload : `withXhr()`, `reportProgress` + `observe: 'events'`, états `idle` / `uploading` / `success` / `error`, barre de progression, contrôles désactivés. Testé OK (throttling 3G).
- [x] Capture upload avec progression : `screenshots/tp3/upload-progress.png` (19 %, requête `tracks` en `pending`, type `xhr`).
- [x] Mission 7 — 7 tests frontend (Vitest, 4 fichiers `*.spec.ts`) + rapport des tests ci-dessous. `npm test` : 7 passed.
- [x] `npm run build` : OK, sans erreur.
- [x] Rapport IA : `RAPPORT_IA_TP3.md` (structure de `RAPPORT_IA_MODELE.md`).

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

## Mission 7 — Tests automatisés

### Mise en place

| Élément | Rôle |
|---|---|
| `vitest` (déjà présent) + builder `@angular/build:unit-test` | lance les tests avec `npm test` (`ng test --watch=false`) |
| `jsdom` (ajouté en devDependency) | faux navigateur (DOM, `localStorage`) pour exécuter les tests dans le terminal |
| `tsconfig.spec.json` (ajouté) | compile les `*.spec.ts` avec les types `vitest/globals` (`describe`, `it`, `expect`) |
| `tsconfig.app.json` | exclut les `*.spec.ts` du build de l'application |
| `angular.json` → `test.options.buildTarget` | indique au builder de test la configuration de build à réutiliser |
| `provideHttpClientTesting()` + `HttpTestingController` | remplace le réseau : intercepte la requête, permet de l'inspecter et de fournir une réponse simulée (`flush`) |

### Rapport des tests (attendu / observé)

| # | Fichier | Test | Résultat attendu | Observé |
|---|---|---|---|---|
| 1 | `shared/services/track.service.spec.ts` | `list(2, 5)` | une requête `GET /api/tracks` avec `page=2` et `limit=5` ; la réponse simulée est renvoyée telle quelle | ✅ passe |
| 2 | `shared/services/track.service.spec.ts` | `remove('abc123')` | une requête `DELETE /api/tracks/abc123` ; la réponse `204` termine l'Observable | ✅ passe |
| 3 | `shared/services/auth.service.spec.ts` | `login()` | `POST /api/auth/login` avec le corps `{ email, password }` ; après la réponse, `token()`, `currentUser()` et `localStorage['gpc_token']` sont remplis | ✅ passe |
| 4 | `shared/interceptors/auth.interceptor.spec.ts` | avec token | header `Authorization: Bearer faux-token` présent | ✅ passe |
| 5 | `shared/interceptors/auth.interceptor.spec.ts` | sans token | aucun header `Authorization` | ✅ passe |
| 6 | `shared/guards/auth.guard.spec.ts` | sans token | le guard renvoie un `UrlTree` vers `/login` | ✅ passe |
| 7 | `shared/guards/auth.guard.spec.ts` | avec token | le guard renvoie `true` | ✅ passe |

Résultat de `npm test` : `Test Files 4 passed (4)` — `Tests 7 passed (7)`.

`afterEach(() => http.verify())` fait échouer un test si une requête inattendue a été envoyée ou si une requête attendue n'a pas été traitée.

**Vérification que les tests détectent un bug** : en retirant `page` des `params` de `TrackService.list()`, le test n°1 échoue (`expected null to be '2'`). Une fois le code rétabli, les 7 tests repassent.

## Restitution orale — réponses

**1. Pourquoi la suppression passe par un service ?**
Le composant gère l'affichage et les interactions ; `TrackService` centralise les appels HTTP aux pistes. L'URL et la méthode sont définies à un seul endroit, réutilisables, et testables isolément (test n°2) sans afficher de composant.

**2. Comment le backend protège la suppression ?**
Le middleware `auth` vérifie la signature et l'expiration du JWT (sinon `401`). Puis `Track.findOneAndDelete({ _id, ownerId: req.auth.sub })` ne supprime que si la piste appartient à l'utilisateur du token (sinon `404`). Le guard et le bouton côté Angular sont contournables (curl).

**3. Comment Angular calcule le pourcentage d'upload ?**
Avec `reportProgress: true` et `observe: 'events'`, `HttpClient` (backend XHR) émet des événements `HttpEventType.UploadProgress` contenant `loaded` (octets envoyés) et `total` (taille totale). Pourcentage = `Math.round(100 * loaded / total)`.

**4. Pourquoi les tests HTTP n'ont pas besoin de MongoDB ?**
`provideHttpClientTesting()` remplace le backend HTTP d'Angular : aucune requête ne quitte le test. `HttpTestingController` capture la requête et le test fournit la réponse simulée. On teste le code Angular (URL, méthode, paramètres, headers, traitement de la réponse), pas le serveur ni la base.

**5. Que vérifie un test d'intercepteur ou de guard ?**
Intercepteur : qu'il modifie correctement la requête sortante (header `Authorization` présent avec un token, absent sans). Guard : la décision de navigation selon l'état (`true` avec token, `UrlTree` vers `/login` sans token).

**6. Différence entre test unitaire et test d'intégration ?**
Un test unitaire vérifie une seule pièce isolée, avec ses dépendances simulées (ici : un service avec un faux réseau). Un test d'intégration vérifie que plusieurs pièces réelles fonctionnent ensemble (par exemple Angular + Express + MongoDB, ou les tests backend `api.test.js` qui appellent les vraies routes). Le test d'intercepteur est à la frontière : il branche le vrai intercepteur sur le vrai `HttpClient`, mais le réseau reste simulé.
