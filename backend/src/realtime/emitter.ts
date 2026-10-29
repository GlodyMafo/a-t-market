/**
 * Point de sortie unique du temps réel.
 *
 * Les services métier appellent `emitToUser` sans rien savoir de Socket.io : tant que le serveur
 * temps réel n'est pas démarré (tests, scripts), l'appel ne fait simplement rien.
 * L'envoi est « au mieux » : une erreur ici ne doit JAMAIS faire échouer un paiement ou un suivi.
 */
export type RealtimeEmitter = (userId: string, event: string, payload: unknown) => void;

let emitter: RealtimeEmitter | null = null;

export function setRealtimeEmitter(next: RealtimeEmitter | null) {
  emitter = next;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  if (!emitter) return;
  try {
    emitter(userId, event, payload);
  } catch (error: any) {
    console.error("TEMPS RÉEL : envoi impossible :", error?.message);
  }
}