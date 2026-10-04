# TP2 — Réponses et suivi

## Où on en est (dernière mise à jour : 04/10/2026)

- [x] Mission 2 — pagination serveur (`tracks-page.ts` / `.html`), testée : 2 pages, une requête par changement de page.
- [x] Capture Network pagination : `screenshots/tp2/pagination-network.png`.
- [x] Mission 3 — upload : validation front (format + 25 Mo), état d'envoi, anti double-clic, erreurs serveur, succès, reset du formulaire, retour page 1. Testé OK.
- [x] Mission 3 — cards responsives (titre, nom, format, taille lisible, date, ▶). Testé OK.
- [x] Mission 3 — lecteur : « En cours », erreurs audio, `revokeObjectURL` dans `ngOnDestroy`. Testé OK.
- [x] Réponses aux questions mémoire / buffering / streaming (ci-dessous).
- [x] Captures : upload multipart (Payload `audio` + `title`) → `screenshots/tp2/upload-payload.png` ; lecture authentifiée (header `Authorization`) → `screenshots/tp2/audio-authorization.png`.
- [x] Preuve du `400` backend via `curl` (fichier texte → 400, sans fichier → 400, sans token → 401) → `screenshots/tp2/curl-400.png`.
- [ ] Facultatif : suppression, barre de progression, filtre, Angular Material Paginator.

## Flux Mission 2 — pagination

```text
TracksPageComponent.load() → TrackService.list(page, 5) → HttpClient → GET /api/tracks?page=2&limit=5
→ Express : auth → Track.find({ ownerId }).skip((page-1)*limit).limit(limit) + countDocuments
← { items, page, limit, total, pages }
```

Chaque changement de page déclenche une nouvelle requête : on ne récupère jamais toutes les pistes pour les découper dans Angular. Un `304 Not Modified` dans Network signifie que le navigateur réutilise sa copie en cache (ce n'est pas une erreur).

## Flux Mission 3 — upload

| Étape | Fichier / méthode |
|---|---|
| Choix du fichier | `tracks-page.ts` → `choose()` (+ `validate()`) |
| Construction du `FormData` (`audio`, `title`) | `track.service.ts` → `upload()` |
| Appel HTTP | `track.service.ts` → `http.post('/api/tracks')`, JWT ajouté par `auth.interceptor.ts` |
| Contrôles backend | `backend/src/app.js` : `upload.single("audio")` (multer), `fileFilter` sur `allowed` (MP3/WAV/OGG/M4A), `limits.fileSize` = 25 Mo, `400` si pas de fichier ; erreurs converties en `400` par le gestionnaire central |

La validation frontend évite une requête inutile et donne un message immédiat ; elle est contournable (curl, Postman, F12), donc la validation backend reste la seule garantie.

### Preuve : le backend refuse seul un fichier invalide (sans passer par Angular)

Capture : `screenshots/tp2/curl-400.png`.

```bash
# 1. Récupérer un token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"Demo1234!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# 2. Envoyer un fichier texte déguisé en audio
echo "je ne suis pas un mp3" > faux.txt
curl -i -X POST http://localhost:3000/api/tracks -H "Authorization: Bearer $TOKEN" \
  -F "audio=@faux.txt;type=text/plain" -F "title=fichier pirate"
```

| Test | Réponse obtenue |
|---|---|
| Fichier `text/plain` | `400 Bad Request` — `{"message":"Format audio non accepté"}` (`fileFilter`) |
| Aucun fichier | `400 Bad Request` — `{"message":"Fichier audio requis"}` |
| Aucun token | `401 Unauthorized` — `{"message":"Authentification requise"}` |

## Flux Mission 3 — lecture

```text
play(track) → TrackService.audio(id) (responseType: 'blob') → intercepteur (Authorization: Bearer)
→ GET /api/tracks/:id/audio → backend vérifie ownerId → res.sendFile
← Blob → URL.createObjectURL(blob) → <audio [src]> ; l'ancienne URL est révoquée
```

## Pourquoi `Blob` + `ObjectURL`

Une URL d'API placée directement dans `<audio src>` est demandée par le navigateur lui-même, sans passer par `HttpClient` ni par l'intercepteur : le header `Authorization` n'est donc pas ajouté et le backend répond `401`. On télécharge donc le fichier avec `HttpClient` (qui ajoute le JWT), on obtient un `Blob` en mémoire, puis `URL.createObjectURL` crée une adresse locale `blob:` utilisable par le lecteur. Contreparties : la lecture ne commence qu'après le téléchargement complet, et l'URL doit être révoquée pour libérer la mémoire.

## Questions mémoire, buffering et streaming

**Blob vs buffering vs streaming.** Blob : le fichier entier est téléchargé avant d'être utilisé. Buffering : le lecteur du navigateur charge un peu d'avance pendant la lecture. Streaming serveur : le serveur envoie le fichier par morceaux au lieu de le préparer entièrement en mémoire.

1. **Le backend envoie-t-il le fichier entier en mémoire ?** Non : `res.sendFile` lit le fichier depuis le disque et l'envoie progressivement (flux).
2. **Quand le composant reçoit-il le fichier avec `responseType: 'blob'` ?** Une seule fois, quand la réponse est complète : `HttpClient` assemble tous les morceaux avant d'appeler `next`.
3. **100 morceaux = 100 fichiers en mémoire ?** Non. `GET /api/tracks` ne renvoie que des métadonnées, 5 par page ; l'audio n'est téléchargé que dans `play()`, au clic, et l'URL précédente est révoquée : un seul fichier audio en mémoire à la fois.
4. **100 `<audio>` avec une URL HTTP directe ?** Sans JWT, ils recevraient `401`. Sinon, chaque lecteur gérerait lui-même son téléchargement (préchargement possible pour chacun, lecture qui démarre avant la fin grâce au buffering).
5. **Pourquoi révoquer l'`ObjectURL` ?** Tant qu'elle existe, le navigateur garde le `Blob` en mémoire. Une application Angular ne recharge pas la page : sans `revokeObjectURL`, chaque morceau écouté s'accumulerait (fuite mémoire).
