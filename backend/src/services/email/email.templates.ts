/**
 * Modèles d'e-mails AT-MARKET (français, HTML + texte brut).
 *
 * Fichier « pur » : aucune base de données, aucune configuration.
 * Chaque événement n'accepte que les champs prévus (liste blanche) :
 * rien d'autre ne peut se retrouver dans un e-mail.
 */

export const EMAIL_TRACKING_STATUSES = [
  "PURCHASED",
  "PREPARING",
  "IN_TRANSIT",
  "ARRIVED_DRC",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

export type EmailTrackingStatus = (typeof EMAIL_TRACKING_STATUSES)[number];

/** Vrai pour les statuts de suivi qui déclenchent un e-mail (les autres restent des notifications internes). */
export function isEmailTrackingStatus(status: string): status is EmailTrackingStatus {
  return (EMAIL_TRACKING_STATUSES as readonly string[]).includes(status);
}

export type EmailEvent =
  | { kind: "ORDER_CREATED"; totalAmount: string | number; reservationMinutes?: number }
  | {
      kind: "PAYMENT_CONFIRMED";
      paidAmount: string | number;
      remainingAmount: string | number;
      orderFullyPaid: boolean;
    }
  | { kind: "PAYMENT_FAILED"; amount: string | number }
  | { kind: "TRACKING"; status: EmailTrackingStatus; message?: string }
  | { kind: "ORDER_CANCELLED" };

export interface EmailContext {
  /** Référence lisible de la commande, ex. « #ABC123 ». */
  orderRef: string;
  /** Date de l'événement. */
  occurredAt: Date;
  /** Adresse du site (FRONTEND_URL). Absente ou invalide : l'e-mail ne contient aucun lien. */
  frontendUrl?: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const BRAND = "AT-MARKET";
const TIME_ZONE = "Africa/Lubumbashi";

// ---------- Utilitaires ----------

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Date en français, à l'heure de Lubumbashi. Ex. : « 2 novembre 2026 à 12:30 ». */
export function formatEmailDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(date);
}

const money = (value: string | number): string => {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)} $` : "—";
};

/** Origine du site si l'URL est http(s) valide, sinon null (jamais de chemin, jamais de javascript:). */
function safeSiteUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

// ---------- Contenu par événement ----------

interface Section {
  subject: string;
  title: string;
  status: string;
  paragraphs: string[];
}

const TRACKING_CONTENT: Record<
  EmailTrackingStatus,
  { subject: string; title: string; status: string; body: string }
> = {
  PURCHASED: {
    subject: "produit acheté",
    title: "Votre produit a été acheté",
    status: "Produit acheté",
    body: "Nous avons acheté votre produit auprès du vendeur.",
  },
  PREPARING: {
    subject: "en préparation",
    title: "Votre commande est en préparation",
    status: "En préparation",
    body: "Notre équipe prépare actuellement votre commande.",
  },
  IN_TRANSIT: {
    subject: "en transit",
    title: "Votre commande est en transit",
    status: "En transit",
    body: "Votre commande est en route vers la RDC.",
  },
  ARRIVED_DRC: {
    subject: "arrivée en RDC",
    title: "Votre commande est arrivée en RDC",
    status: "Arrivée en RDC",
    body: "Bonne nouvelle : votre commande est arrivée en RDC.",
  },
  OUT_FOR_DELIVERY: {
    subject: "en cours de livraison",
    title: "Votre commande est en cours de livraison",
    status: "En cours de livraison",
    body: "Votre commande est en cours de livraison.",
  },
  DELIVERED: {
    subject: "livrée",
    title: "Votre commande a été livrée",
    status: "Livrée",
    body: "Votre commande a été livrée. Merci de votre confiance !",
  },
};

function describe(event: EmailEvent, ref: string): Section {
  switch (event.kind) {
    case "ORDER_CREATED": {
      const paragraphs = [
        `Nous avons bien enregistré votre commande ${ref}, d'un montant total de ${money(event.totalAmount)}.`,
        "Elle sera validée dès la réception de votre paiement.",
      ];
      const minutes = event.reservationMinutes;
      if (minutes && minutes > 0) {
        paragraphs.push(
          `Sans paiement, elle sera annulée automatiquement au bout de ${minutes} minute${minutes > 1 ? "s" : ""}.`
        );
      }
      return {
        subject: `commande ${ref} enregistrée`,
        title: "Votre commande est enregistrée",
        status: "Commande enregistrée, en attente de paiement",
        paragraphs,
      };
    }

    case "PAYMENT_CONFIRMED":
      if (event.orderFullyPaid) {
        return {
          subject: `paiement reçu, commande ${ref} validée`,
          title: "Paiement confirmé",
          status: "Paiement confirmé, commande validée",
          paragraphs: [
            `Nous avons bien reçu votre paiement de ${money(event.paidAmount)}.`,
            `Votre commande ${ref} est validée.`,
          ],
        };
      }
      return {
        subject: `paiement reçu pour la commande ${ref}`,
        title: "Paiement partiel confirmé",
        status: "Paiement partiel confirmé",
        paragraphs: [
          `Nous avons bien reçu votre paiement de ${money(event.paidAmount)} pour la commande ${ref}.`,
          `Il reste ${money(event.remainingAmount)} à payer pour valider votre commande.`,
        ],
      };

    case "PAYMENT_FAILED":
      return {
        subject: `paiement non abouti pour la commande ${ref}`,
        title: "Votre paiement n'a pas abouti",
        status: "Paiement échoué",
        paragraphs: [
          `Votre paiement de ${money(event.amount)} pour la commande ${ref} n'a pas abouti.`,
          "Vous pouvez réessayer depuis votre compte.",
        ],
      };

    case "TRACKING": {
      const c = TRACKING_CONTENT[event.status];
      const paragraphs = [c.body];
      const message = event.message?.replace(/\r/g, "").trim();
      if (message) paragraphs.push(`Information de notre équipe : ${message}`);
      return {
        subject: `commande ${ref} : ${c.subject}`,
        title: c.title,
        status: c.status,
        paragraphs,
      };
    }

    case "ORDER_CANCELLED":
      return {
        subject: `commande ${ref} annulée`,
        title: "Votre commande a été annulée",
        status: "Commande annulée",
        paragraphs: [
          `Votre commande ${ref} n'a pas été payée dans le délai imparti : elle a été annulée automatiquement.`,
          "Si vous souhaitez toujours ces articles, vous pouvez passer une nouvelle commande depuis votre compte.",
        ],
      };

    default: {
      const jamais: never = event;
      throw new Error(`Événement d'e-mail inconnu : ${JSON.stringify(jamais)}`);
    }
  }
}

// ---------- Assemblage ----------

export function renderEmail(event: EmailEvent, ctx: EmailContext): RenderedEmail {
  const section = describe(event, ctx.orderRef);
  const date = formatEmailDate(ctx.occurredAt);
  const site = safeSiteUrl(ctx.frontendUrl);
  const subject = `${BRAND} : ${section.subject}`.replace(/[\r\n]+/g, " ");

  const details: Array<[string, string]> = [
    ["Commande", ctx.orderRef],
    ["Statut", section.status],
    ["Date", date],
  ];

  const accountLine = site
    ? `Consultez votre compte : ${site}`
    : `Consultez votre compte sur la plateforme ${BRAND} pour suivre votre commande.`;

  const footer = "Cet e-mail est envoyé automatiquement, merci de ne pas y répondre.";

  // ----- Texte brut -----
  const text = [
    BRAND,
    "",
    "Bonjour,",
    "",
    section.title,
    "",
    ...section.paragraphs.flatMap((p) => [p, ""]),
    ...details.map(([label, value]) => `${label} : ${value}`),
    "",
    accountLine,
    "",
    footer,
  ].join("\n");

  // ----- HTML (styles en ligne, aucune ressource externe) -----
  const paragraphsHtml = section.paragraphs
    .map((p) => `<p style="margin:0 0 14px;line-height:1.5;">${escapeHtml(p)}</p>`)
    .join("\n");

  const detailsHtml = details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;font-weight:bold;">${escapeHtml(value)}</td></tr>`
    )
    .join("\n");

  const accountHtml = site
    ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(site)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;">Consulter mon compte</a></p>`
    : `<p style="margin:20px 0 0;line-height:1.5;">${escapeHtml(accountLine)}</p>`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#111827;color:#ffffff;padding:18px 28px;font-size:20px;font-weight:bold;letter-spacing:1px;">${BRAND}</td></tr>
<tr><td style="padding:28px;">
<p style="margin:0 0 14px;">Bonjour,</p>
<h1 style="margin:0 0 18px;font-size:20px;line-height:1.3;">${escapeHtml(section.title)}</h1>
${paragraphsHtml}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;width:100%;padding:8px 0;">
${detailsHtml}
</table>
${accountHtml}
</td></tr>
<tr><td style="padding:16px 28px;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.5;">${escapeHtml(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}