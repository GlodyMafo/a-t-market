"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initRealtime = initRealtime;
const socket_io_1 = require("socket.io");
const env_1 = require("../config/env");
const jwt_1 = require("../utils/jwt");
const emitter_1 = require("./emitter");
const room = (userId) => `user:${userId}`;
/**
 * Serveur temps réel. Un client se connecte avec son jeton :
 *
 *   io(API_URL, { auth: { token } })
 *
 * et reçoit l'événement « notification » pour tout ce qui concerne SES commandes.
 * Le serveur n'accepte aucun message venant du client : c'est un canal à sens unique.
 */
function initRealtime(httpServer) {
    const io = new socket_io_1.Server(httpServer, {
        cors: { origin: env_1.env.CORS_ALLOWED_ORIGINS },
        maxHttpBufferSize: 10_000,
    });
    io.use((socket, next) => {
        const brut = socket.handshake.auth?.token;
        if (typeof brut !== "string" || brut.length === 0) {
            return next(new Error("UNAUTHORIZED"));
        }
        try {
            const token = brut.startsWith("Bearer ") ? brut.slice(7) : brut;
            socket.data.userId = (0, jwt_1.verifyToken)(token).userId;
            next();
        }
        catch {
            next(new Error("UNAUTHORIZED"));
        }
    });
    io.on("connection", (socket) => {
        // Une « salle » par utilisateur : plusieurs onglets ou appareils reçoivent tous les événements.
        socket.join(room(socket.data.userId));
    });
    (0, emitter_1.setRealtimeEmitter)((userId, event, payload) => {
        io.to(room(userId)).emit(event, payload);
    });
    return io;
}
