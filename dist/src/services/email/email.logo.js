"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOGO_CID = void 0;
exports.logoInlineImage = logoInlineImage;
/**
 * Icône A&T Market pour les e-mails (PNG 144x144, transparent, ~1,6 Ko).
 *
 * Elle est embarquée dans le code (et non lue sur le disque) : elle fonctionne donc aussi
 * après compilation (dist/), sans fichier à copier, et sans dépendre d'un hébergement d'images.
 * Elle est jointe à chaque e-mail en « image intégrée » (CID), seule méthode affichée de façon
 * fiable par Gmail (les images en base64 dans le HTML y sont bloquées).
 */
exports.LOGO_CID = "at-logo";
const LOGO_PNG_BASE64 = "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";
function logoInlineImage() {
    return {
        cid: exports.LOGO_CID,
        filename: "logo-at-market.png",
        contentType: "image/png",
        content: Buffer.from(LOGO_PNG_BASE64, "base64"),
    };
}
