// Script lancé en sous-processus par env.email.test.ts.
// Il n'affiche jamais le mot de passe SMTP.
import { env } from "../../config/env";

console.log(
  JSON.stringify({
    smtp: env.SMTP !== null,
    frontend: env.FRONTEND_URL ?? null,
  })
);