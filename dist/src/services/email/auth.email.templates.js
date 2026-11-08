"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderAuthEmail = renderAuthEmail;
const email_logo_1 = require("./email.logo");
const email_templates_1 = require("./email.templates");
const CONTENT = {
    VERIFY_EMAIL: {
        subject: "Confirmez votre adresse e-mail - A&T Market",
        title: "Confirmez votre adresse e-mail",
        text: "Bienvenue sur A&T Market. Confirmez votre adresse e-mail pour sécuriser votre compte et recevoir les informations de vos commandes.",
        button: "Confirmer mon e-mail",
        note: "Ce lien est valable 24 heures. Si vous n'avez pas créé de compte, ignorez ce message.",
    },
    RESET_PASSWORD: {
        subject: "Réinitialisation de votre mot de passe - A&T Market",
        title: "Réinitialisez votre mot de passe",
        text: "Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.",
        button: "Choisir un nouveau mot de passe",
        note: "Ce lien est valable 1 heure et ne fonctionne qu'une fois. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.",
    },
};
/** `link` est construit par le serveur à partir de FRONTEND_URL et d'un jeton aléatoire : jamais à partir d'une saisie utilisateur. */
function renderAuthEmail(kind, link) {
    const c = CONTENT[kind];
    const safeLink = (0, email_templates_1.escapeHtml)(link);
    const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#EEF2F9;font-family:Arial,Helvetica,sans-serif;color:#1F2A44">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #DCE4F2;border-radius:12px">
<tr><td style="padding:24px 28px 8px"><img src="cid:${email_logo_1.LOGO_CID}" alt="A&amp;T Market" height="40" style="display:block"></td></tr>
<tr><td style="padding:8px 28px 0"><h1 style="margin:0;font-size:20px;color:#1F2A44">${(0, email_templates_1.escapeHtml)(c.title)}</h1></td></tr>
<tr><td style="padding:12px 28px;font-size:15px;line-height:1.5">${(0, email_templates_1.escapeHtml)(c.text)}</td></tr>
<tr><td style="padding:8px 28px 20px"><a href="${safeLink}" style="display:inline-block;background:#3D64AF;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:8px">${(0, email_templates_1.escapeHtml)(c.button)}</a></td></tr>
<tr><td style="padding:0 28px 8px;font-size:12px;color:#6B7280;line-height:1.5">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all">${safeLink}</span></td></tr>
<tr><td style="padding:12px 28px 24px;font-size:12px;color:#6B7280;line-height:1.5">${(0, email_templates_1.escapeHtml)(c.note)}</td></tr>
</table></td></tr></table></body></html>`;
    const text = `${c.title}\n\n${c.text}\n\n${c.button} : ${link}\n\n${c.note}`;
    return { subject: c.subject, html, text, inlineImages: [(0, email_logo_1.logoInlineImage)()] };
}
