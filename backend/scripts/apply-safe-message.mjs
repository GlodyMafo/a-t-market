// Script à usage unique : remplace `error.message` par `safeMessage(error)` dans src/controllers.
import fs from "node:fs";
import path from "node:path";

const dir = "src/controllers";

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
  const p = path.join(dir, f);
  const original = fs.readFileSync(p, "utf8");
  let s = original;

  s = s.replace(/message:\s*error\.message(?=\s*[,\n\r}])/g, "message: safeMessage(error)");
  s = s.replace(
    /error instanceof Error\s*\?\s*error\.message\s*:\s*"Impossible de créer le devis\."/,
    'safeMessage(error, "Impossible de créer le devis.")'
  );
  s = s.replace(
    'const message = error instanceof Error ? error.message : "Erreur inattendue";',
    'const message = safeMessage(error, "Erreur inattendue");'
  );

  if (s === original) continue;

  if (!/import[^;]*safeMessage[^;]*from "\.\.\/utils\/appError"/.test(s)) {
    if (/from "\.\.\/utils\/appError"/.test(s)) {
      s = s.replace(
        /import \{([^}]*)\} from "\.\.\/utils\/appError";/,
        (_m, noms) => `import {${noms.trimEnd()}, safeMessage } from "../utils/appError";`
      );
    } else {
      s = 'import { safeMessage } from "../utils/appError";\n' + s;
    }
  }

  fs.writeFileSync(p, s);
  console.log("modifié :", f);
}