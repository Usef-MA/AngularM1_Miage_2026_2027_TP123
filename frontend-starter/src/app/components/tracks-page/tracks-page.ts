import { Component, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';

/** Mêmes règles que le backend (app.js : `allowed` et `MAX_FILE_SIZE`). */
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const FORMATS: Record<string, string> = {
  'audio/mpeg': 'MP3',
  'audio/wav': 'WAV',
  'audio/x-wav': 'WAV',
  'audio/ogg': 'OGG',
  'audio/mp4': 'M4A',
  'audio/x-m4a': 'M4A',
};

@Component({
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent implements OnDestroy {
  private readonly service = inject(TrackService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  // Bibliothèque paginée (Mission 2)
  readonly limit = 5;
  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');

  // Upload (Mission 3)
  readonly title = new FormControl('', { nonNullable: true });
  readonly file = signal<File | undefined>(undefined);
  readonly uploading = signal(false);
  readonly uploadError = signal('');
  readonly uploadSuccess = signal('');

  // Lecture (Mission 3)
  readonly audioUrl = signal('');
  readonly currentTrack = signal<Track | undefined>(undefined);
  readonly audioLoading = signal(false);
  readonly audioError = signal('');

  // Suppression (Mission 5) : id de la piste en cours de suppression.
  readonly deletingId = signal<string | undefined>(undefined);

  constructor() {
    this.load();
  }

  choose(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.file.set(file);
    this.uploadSuccess.set('');
    this.uploadError.set(file ? this.validate(file) : '');
    console.debug('[TracksPage] Fichier sélectionné', file?.name);
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.service.list(this.page(), this.limit).subscribe({
      next: (response) => {
        console.debug('[TracksPage] Pistes chargées', response.items.length);
        // Page vidée (dernière piste supprimée, ici ou dans un autre onglet) : on recule.
        if (response.items.length === 0 && response.page > response.pages) {
          this.page.set(response.pages);
          this.load();
          return;
        }
        this.tracks.set(response.items);
        // Le serveur fait foi : il peut corriger une page hors bornes.
        this.page.set(response.page);
        this.pages.set(response.pages);
        this.loading.set(false);
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[TracksPage] Chargement impossible', error);
        this.error.set(error.error?.message ?? 'Impossible de charger vos pistes.');
        this.loading.set(false);
      },
    });
  }

  go(page: number): void {
    if (page < 1 || page > this.pages() || this.loading()) return;
    this.page.set(page);
    this.load();
  }

  upload(): void {
    const file = this.file();
    // Empêche la double soumission pendant un envoi.
    if (this.uploading()) return;

    // Contrôle côté front : confort uniquement, le backend revérifie tout.
    const problem = file ? this.validate(file) : 'Choisissez un fichier audio.';
    if (problem || !file) {
      this.uploadError.set(problem);
      return;
    }

    this.uploading.set(true);
    this.uploadError.set('');
    this.uploadSuccess.set('');

    this.service
      .upload(file, this.title.value.trim() || file.name)
      .pipe(finalize(() => this.uploading.set(false)))
      .subscribe({
        next: (track) => {
          console.debug('[TracksPage] Piste envoyée', track.id);
          this.uploadSuccess.set(`« ${track.title} » a bien été ajoutée.`);
          this.resetForm();
          this.page.set(1);
          this.load();
        },
        error: (error: { error?: { message?: string } }) => {
          console.error('[TracksPage] Envoi impossible', error);
          this.uploadError.set(error.error?.message ?? "L'envoi a échoué, réessayez.");
        },
      });
  }

  play(track: Track): void {
    this.audioLoading.set(true);
    this.audioError.set('');
    this.service.audio(track.id).subscribe({
      next: (blob) => {
        console.debug('[TracksPage] Audio chargé', track.id);
        this.revokeAudioUrl();
        this.audioUrl.set(URL.createObjectURL(blob));
        this.currentTrack.set(track);
        this.audioLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Lecture impossible', error);
        // Avec responseType 'blob', le corps d'erreur est un Blob : on s'appuie sur le statut.
        this.audioError.set(
          error.status === 404
            ? `« ${track.title} » est introuvable ou ne vous appartient pas.`
            : `Impossible de charger « ${track.title} ».`,
        );
        this.audioLoading.set(false);
      },
    });
  }

  remove(track: Track): void {
    // Une seule suppression à la fois : empêche les doubles clics.
    if (this.deletingId()) return;
    if (!confirm(`Supprimer « ${track.title} » ? Cette action est définitive.`)) return;

    this.deletingId.set(track.id);
    this.service
      .remove(track.id)
      .pipe(finalize(() => this.deletingId.set(undefined)))
      .subscribe({
        next: () => {
          console.debug('[TracksPage] Piste supprimée', track.id);
          this.stopIfPlaying(track);
          this.notify(`« ${track.title} » a été supprimée.`);
          this.load();
        },
        error: (error: HttpErrorResponse) => {
          if (error.status === 404) {
            // Déjà supprimée (autre onglet) ou pas à nous : cas prévu, la liste affichée est périmée.
            console.warn('[TracksPage] Piste déjà supprimée ou inaccessible', track.id);
            this.stopIfPlaying(track);
            this.notify(`« ${track.title} » n'existe plus ou ne vous appartient pas.`);
            this.load();
            return;
          }
          console.error('[TracksPage] Suppression impossible', error);
          this.notify(error.error?.message ?? `Impossible de supprimer « ${track.title} ».`);
        },
      });
  }

  /** Erreur de décodage ou de lecture signalée par l'élément <audio>. */
  onAudioError(): void {
    console.error('[TracksPage] Le lecteur ne peut pas lire ce fichier');
    this.audioError.set('Le navigateur ne parvient pas à lire ce fichier audio.');
  }

  format(mimeType: string): string {
    return FORMATS[mimeType] ?? mimeType;
  }

  /** La taille renvoyée par l'API est en octets. */
  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  ngOnDestroy(): void {
    // Libère le dernier fichier audio gardé en mémoire en quittant la page.
    this.revokeAudioUrl();
  }

  private validate(file: File): string {
    if (!FORMATS[file.type]) return 'Format non accepté : choisissez un fichier MP3, WAV, OGG ou M4A.';
    if (file.size > MAX_FILE_SIZE) return `Fichier trop lourd (${this.formatSize(file.size)}) : 25 Mo maximum.`;
    return '';
  }

  private resetForm(): void {
    this.title.setValue('');
    this.file.set(undefined);
    // Un <input type="file"> ne se vide que via sa propriété value.
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = '';
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'OK', { duration: 4000 });
  }

  /** Coupe le lecteur si la piste supprimée était en cours d'écoute. */
  private stopIfPlaying(track: Track): void {
    if (this.currentTrack()?.id !== track.id) return;
    this.revokeAudioUrl();
    this.currentTrack.set(undefined);
  }

  private revokeAudioUrl(): void {
    const url = this.audioUrl();
    if (url) URL.revokeObjectURL(url);
    this.audioUrl.set('');
  }
}
