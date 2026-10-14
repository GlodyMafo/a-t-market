import http from "node:http";
import { FAKE_PAWAPAY_PORT } from "../setup";

/**
 * Faux serveur PawaPay : répond à GET /v2/deposits/{id} avec ce qu'on lui dit.
 * Permet de tester le vrai chemin HTTP sans aucun appel réseau externe.
 */
export class FakePawapay {
  private server!: http.Server;
  public responses = new Map<string, unknown>();
  public calls: string[] = [];
  public httpStatus = 200;
  public deposits: any[] = [];
  public postStatus = 200;
  public postResponse: unknown = null;

  async start() {
    this.server = http.createServer((req, res) => {
      // Création d'un dépôt : POST /v2/deposits
      if (req.method === "POST") {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
          const body = JSON.parse(raw || "{}");
          this.deposits.push(body);
          res.statusCode = this.postStatus;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify(
              this.postResponse ?? { depositId: body.depositId, status: "ACCEPTED" }
            )
          );
        });
        return;
      }

      const depositId = decodeURIComponent((req.url ?? "").split("/").pop() ?? "");
      this.calls.push(depositId);
      const body = this.responses.get(depositId) ?? { status: "NOT_FOUND" };
      res.statusCode = this.httpStatus;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    });
    await new Promise<void>((r) => this.server.listen(FAKE_PAWAPAY_PORT, "127.0.0.1", r));
  }

  reset() {
    this.responses.clear();
    this.calls = [];
    this.httpStatus = 200;
    this.deposits = [];
    this.postStatus = 200;
    this.postResponse = null;
  }

  /** Programme la réponse "dépôt trouvé" */
  setDeposit(
    depositId: string,
    data: { status: string; amount?: string; currency?: string; depositId?: string }
  ) {
    this.responses.set(depositId, {
      status: "FOUND",
      data: { depositId, ...data },
    });
  }

  async stop() {
    await new Promise<void>((r) => this.server.close(() => r()));
  }
}