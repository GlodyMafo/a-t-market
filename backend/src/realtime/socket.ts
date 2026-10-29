import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env";
import { verifyToken } from "../utils/jwt";
import { setRealtimeEmitter } from "./emitter";

const room = (userId: string) => `user:${userId}`;

/**
 * Serveur temps réel. Un client se connecte avec son jeton :
 *
 *   io(API_URL, { auth: { token } })
 *
 * et reçoit l'événement « notification » pour tout ce qui concerne SES commandes.
 * Le serveur n'accepte aucun message venant du client : c'est un canal à sens unique.
 */
export function initRealtime(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CORS_ALLOWED_ORIGINS },
    maxHttpBufferSize: 10_000,
  });

  io.use((socket, next) => {
    const brut = socket.handshake.auth?.token;

    if (typeof brut !== "string" || brut.length === 0) {
      return next(new Error("UNAUTHORIZED"));
    }

    try {
      const token = brut.startsWith("Bearer ") ? brut.slice(7) : brut;
      socket.data.userId = verifyToken(token).userId;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    // Une « salle » par utilisateur : plusieurs onglets ou appareils reçoivent tous les événements.
    socket.join(room(socket.data.userId));
  });

  setRealtimeEmitter((userId, event, payload) => {
    io.to(room(userId)).emit(event, payload);
  });

  return io;
}