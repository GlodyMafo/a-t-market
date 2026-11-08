"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APIFY_RUN_OPTIONS = void 0;
/**
 * Limites d'une exécution d'acteur Apify (en secondes).
 * - timeout  : Apify interrompt l'acteur lui-même (plus de coût, plus d'exécution orpheline)
 * - waitSecs : durée maximale pendant laquelle NOTRE serveur attend la fin
 */
exports.APIFY_RUN_OPTIONS = {
    timeout: 120,
    waitSecs: 120,
};
