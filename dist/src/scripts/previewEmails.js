"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const email_logo_1 = require("../services/email/email.logo");
const email_templates_1 = require("../services/email/email.templates");
const OUT = node_path_1.default.resolve(process.cwd(), "email-previews");
node_fs_1.default.mkdirSync(OUT, { recursive: true });
const ctx = {
    orderRef: "#ABC123",
    occurredAt: new Date(),
    frontendUrl: "https://at-market.example",
};
const samples = [
    { name: "01-commande-enregistree", event: { kind: "ORDER_CREATED", totalAmount: "34.00", reservationMinutes: 60 } },
    { name: "02-paiement-partiel", event: { kind: "PAYMENT_CONFIRMED", paidAmount: "10.00", remainingAmount: "24.00", orderFullyPaid: false } },
    { name: "03-paiement-complet", event: { kind: "PAYMENT_CONFIRMED", paidAmount: "34.00", remainingAmount: "0.00", orderFullyPaid: true } },
    { name: "04-paiement-echoue", event: { kind: "PAYMENT_FAILED", amount: "34.00" } },
    { name: "05-produit-achete", event: { kind: "TRACKING", status: "PURCHASED", message: "Acheté sur SHEIN" } },
    { name: "06-en-preparation", event: { kind: "TRACKING", status: "PREPARING" } },
    { name: "07-en-transit", event: { kind: "TRACKING", status: "IN_TRANSIT" } },
    { name: "08-arrivee-rdc", event: { kind: "TRACKING", status: "ARRIVED_DRC" } },
    { name: "09-en-livraison", event: { kind: "TRACKING", status: "OUT_FOR_DELIVERY" } },
    { name: "10-livree", event: { kind: "TRACKING", status: "DELIVERED" } },
    { name: "11-annulee", event: { kind: "ORDER_CANCELLED" } },
];
const liens = [];
for (const { name, event } of samples) {
    const mail = (0, email_templates_1.renderEmail)(event, ctx);
    // Dans un vrai e-mail le logo est joint (cid:). Pour l'aperçu navigateur, on l'incruste en base64.
    const logo = mail.inlineImages.find((i) => i.cid === email_logo_1.LOGO_CID);
    const dataUri = logo ? `data:${logo.contentType};base64,${logo.content.toString("base64")}` : "";
    const html = mail.html.replaceAll(`cid:${email_logo_1.LOGO_CID}`, dataUri);
    node_fs_1.default.writeFileSync(node_path_1.default.join(OUT, `${name}.html`), html, "utf8");
    node_fs_1.default.writeFileSync(node_path_1.default.join(OUT, `${name}.txt`), `Sujet : ${mail.subject}\n\n${mail.text}`, "utf8");
    liens.push(`<li><a href="${name}.html">${name}</a> : ${mail.subject} (<a href="${name}.txt">texte</a>)</li>`);
}
node_fs_1.default.writeFileSync(node_path_1.default.join(OUT, "index.html"), `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Aperçus e-mails</title></head><body><h1>Aperçus des e-mails A&amp;T Market</h1><ul>${liens.join("")}</ul></body></html>`, "utf8");
console.log(`${samples.length} aperçus générés dans ${OUT}`);
console.log(`Ouvre ${node_path_1.default.join(OUT, "index.html")} dans ton navigateur.`);
