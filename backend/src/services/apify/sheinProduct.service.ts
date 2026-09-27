import { ApifyClient } from "apify-client";

export class SheinProductService {
  private client: ApifyClient;

  /**
   * ID de l'Actor Apify :
   * SHEIN Product Scraper
   */
  private readonly actorId = "P5fALt8vY7xXgJh56";

  constructor() {
    const token = process.env.APIFY_API_TOKEN;

    if (!token) {
      throw new Error(
        "APIFY_API_TOKEN n'est pas configuré dans les variables d'environnement."
      );
    }

    this.client = new ApifyClient({
      token,
    });
  }

  /**
   * Recherche les détails d'un produit SHEIN
   * à partir de son Goods ID.
   *
   * IMPORTANT :
   *
   * Le deuxième Actor reçoit uniquement l'ID.
   *
   * Exemple :
   *
   * 238675201
   *
   * et PAS l'URL.
   */
  async fetchProductById(productId: string) {
    if (!productId) {
      throw new Error(
        "L'ID du produit SHEIN est obligatoire."
      );
    }

    console.log(
      `\n[Shein Product Scraper] ID reçu : ${productId}`
    );

    /**
     * Input envoyé au deuxième Actor.
     *
     * L'ID provenant automatiquement de Native Emblem
     * sera placé dans searchTerms.
     */
    const input = {
      enrichDetails: true,
      maxItemsPerSearch: 1,
      quickShip: false,
      searchTerms: [productId],
    };

    console.log(
      "[Shein Product Scraper] Lancement de l'Actor..."
    );

    /**
     * Exécution de l'Actor Apify.
     */
    const run = await this.client
      .actor(this.actorId)
      .call(input);

    console.log(
      "[Shein Product Scraper] Actor terminé."
    );

    /**
     * Récupération des résultats du Dataset.
     */
    const { items } = await this.client
      .dataset(run.defaultDatasetId)
      .listItems();

    /**
     * Vérification du résultat.
     */
    if (!items || items.length === 0) {
      throw new Error(
        `Aucun produit trouvé pour l'ID SHEIN ${productId}.`
      );
    }

    console.log(
      `[Shein Product Scraper] ${items.length} produit(s) trouvé(s).`
    );

    /**
     * Pour le moment nous retournons le résultat brut.
     *
     * La normalisation viendra juste après.
     */
    return items[0];
  }
}