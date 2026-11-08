"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setRealtimeEmitter = setRealtimeEmitter;
exports.emitToUser = emitToUser;
let emitter = null;
function setRealtimeEmitter(next) {
    emitter = next;
}
function emitToUser(userId, event, payload) {
    if (!emitter)
        return;
    try {
        emitter(userId, event, payload);
    }
    catch (error) {
        console.error("TEMPS RÉEL : envoi impossible :", error?.message);
    }
}
