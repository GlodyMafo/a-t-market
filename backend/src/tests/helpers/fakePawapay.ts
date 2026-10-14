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

  async start() {
    this.server = http.createServer((req, res) => {
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