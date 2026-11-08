import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import slugify from "slugify";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

type WeightEntry = {
  name: string;
  weight?: number;
  notes?: string;
};

type CategorySeed = {
  name: string;
  subCategories: WeightEntry[];
};

const catalog: CategorySeed[] = [
  // ============================================================
  // 1. MODE FEMME
  // ============================================================
  {
    name: "Mode Femme",
    subCategories: [
      { name: "T-shirts / Tops", weight: 0.35 },
      { name: "Débardeurs / Crop tops", weight: 0.3 },
      { name: "Chemises / Blouses", weight: 0.5 },
      { name: "Bodies", weight: 0.4 },
      { name: "Robes courtes", weight: 0.6 },
      { name: "Robes longues / soirée", weight: 0.9 },
      { name: "Jupes", weight: 0.55 },
      { name: "Shorts", weight: 0.45 },
      { name: "Leggings", weight: 0.4 },
      { name: "Pantalons", weight: 0.75 },
      { name: "Jeans", weight: 0.9 },
      { name: "Combinaisons", weight: 0.8 },
      { name: "Ensembles", weight: 1.0 },
      { name: "Pulls / Cardigans", weight: 0.8 },
      { name: "Sweats / Hoodies", weight: 1.1 },
      { name: "Blazers", weight: 0.9 },
      { name: "Vestes", weight: 1.3 },
      { name: "Manteaux", weight: 1.7 },
      { name: "Pyjamas", weight: 0.6 },
      { name: "Lingerie", weight: 0.25 },
      { name: "Maillots de bain", weight: 0.3 },
      { name: "Vêtements de sport", weight: 0.6 },
      { name: "Vêtements grossesse", weight: 0.7 },
    ],
  },

  // ============================================================
  // 2. MODE HOMME
  // ============================================================
  {
    name: "Mode Homme",
    subCategories: [
      { name: "T-shirts", weight: 0.4 },
      { name: "Débardeurs", weight: 0.35 },
      { name: "Polos", weight: 0.45 },
      { name: "Chemises", weight: 0.6 },
      { name: "Pantalons", weight: 0.8 },
      { name: "Jeans", weight: 0.95 },
      { name: "Shorts", weight: 0.5 },
      { name: "Jogging", weight: 0.9 },
      { name: "Pulls", weight: 0.8 },
      { name: "Sweats / Hoodies", weight: 1.15 },
      { name: "Cardigans", weight: 0.9 },
      { name: "Blazers", weight: 1.0 },
      { name: "Vestes", weight: 1.4 },
      { name: "Manteaux", weight: 1.8 },
      { name: "Costumes / Ensembles", weight: 1.7 },
      { name: "Sous-vêtements", weight: 0.3 },
      { name: "Pyjamas", weight: 0.65 },
      { name: "Maillots de bain", weight: 0.35 },
      { name: "Vêtements sport", weight: 0.6 },
    ],
  },

  // ============================================================
  // 3. ENFANTS / BÉBÉS
  // ============================================================
  {
    name: "Enfants / Bébés",
    subCategories: [
      { name: "Body bébé", weight: 0.25 },
      { name: "Pyjama bébé", weight: 0.35 },
      { name: "Ensemble bébé", weight: 0.45 },
      { name: "T-shirt enfant", weight: 0.3 },
      { name: "Chemise enfant", weight: 0.4 },
      { name: "Robe enfant", weight: 0.5 },
      { name: "Pantalon enfant", weight: 0.5 },
      { name: "Jean enfant", weight: 0.65 },
      { name: "Short enfant", weight: 0.35 },
      { name: "Pull enfant", weight: 0.55 },
      { name: "Hoodie enfant", weight: 0.75 },
      { name: "Veste enfant", weight: 0.9 },
      { name: "Pyjama enfant", weight: 0.45 },
      { name: "Vêtements scolaires", weight: 0.7 },
      { name: "Vêtements sport enfant", weight: 0.45 },
    ],
  },

  // ============================================================
  // 4. CHAUSSURES
  // ============================================================
  {
    name: "Chaussures",
    subCategories: [
      { name: "Sandales femme", weight: 0.8 },
      { name: "Claquettes femme", weight: 0.7 },
      { name: "Sneakers / Baskets femme", weight: 1.3 },
      { name: "Chaussures classiques femme", weight: 1.2 },
      { name: "Mocassins femme", weight: 1.05 },
      { name: "Talons femme", weight: 1.4 },
      { name: "Bottines femme", weight: 1.5 },
      { name: "Bottes femme", weight: 1.9 },

      { name: "Sandales homme", weight: 0.95 },
      { name: "Claquettes homme", weight: 0.85 },
      { name: "Sneakers / Baskets homme", weight: 1.5 },
      { name: "Chaussures classiques homme", weight: 1.4 },
      { name: "Mocassins homme", weight: 1.25 },
      { name: "Bottines homme", weight: 1.7 },
      { name: "Bottes homme", weight: 2.1 },
      { name: "Chaussures sécurité", weight: 2.3 },

      { name: "Sandales enfant", weight: 0.65 },
      { name: "Claquettes enfant", weight: 0.55 },
      { name: "Sneakers / Baskets enfant", weight: 0.95 },
      { name: "Chaussures classiques enfant", weight: 0.85 },
      { name: "Mocassins enfant", weight: 0.75 },
      { name: "Bottines enfant", weight: 1.05 },
      { name: "Bottes enfant", weight: 1.3 },
    ],
  },

  // ============================================================
  // 5. SACS & BAGAGES
  // ============================================================
  {
    name: "Sacs & Bagages",
    subCategories: [
      { name: "Petit sac à main", weight: 0.7 },
      { name: "Sac à main", weight: 1.0 },
      { name: "Grand sac", weight: 1.4 },
      { name: "Sac à dos", weight: 1.15 },
      { name: "Sac ordinateur", weight: 1.4 },
      { name: "Sac voyage", weight: 1.8 },
      { name: "Sac sport", weight: 1.4 },
      { name: "Pochette", weight: 0.35 },
      { name: "Portefeuille", weight: 0.3 },
      { name: "Porte-cartes", weight: 0.2 },
      { name: "Valise cabine", weight: 4.0 },
      { name: "Valise moyenne", weight: 5.5 },
      { name: "Grande valise", weight: 8.0 },
    ],
  },

  // ============================================================
  // 6. BIJOUX / ACCESSOIRES
  // ============================================================
  {
    name: "Bijoux / Accessoires",
    subCategories: [
      { name: "Bague", weight: 0.1 },
      { name: "Boucles d'oreilles", weight: 0.1 },
      { name: "Bracelet", weight: 0.15 },
      { name: "Collier", weight: 0.25 },
      { name: "Montre classique", weight: 0.3 },
      { name: "Montre connectée", weight: 0.35 },
      { name: "Lunettes", weight: 0.25 },
      { name: "Casquette", weight: 0.3 },
      { name: "Chapeau", weight: 0.5 },
      { name: "Ceinture", weight: 0.35 },
      { name: "Écharpe", weight: 0.35 },
      { name: "Gants", weight: 0.25 },
      { name: "Accessoires cheveux", weight: 0.25 },
    ],
  },

  // ============================================================
  // 7. BEAUTÉ / SOINS
  // ============================================================
  {
    name: "Beauté / Soins",
    subCategories: [
      { name: "Maquillage", weight: 0.35 },
      { name: "Palette", weight: 0.6 },
      { name: "Soins visage", weight: 0.6 },
      { name: "Soins corps", weight: 0.7 },
      { name: "Produits capillaires", weight: 0.75 },
      { name: "Shampooing", weight: 1.0 },
      { name: "Parfum", weight: 0.75 },
      { name: "Accessoires beauté", weight: 0.35 },
      { name: "Sèche-cheveux", weight: 1.4 },
      { name: "Fer à lisser", weight: 1.0 },
      { name: "Tondeuse", weight: 0.85 },
      { name: "Perruque synthétique", weight: 0.65 },
      { name: "Perruque cheveux humains", weight: 1.2 },
      { name: "Extensions", weight: 1.2 },
      {
        name: "Matériel professionnel beauté",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 8. TÉLÉPHONES / ÉLECTRONIQUE
  // ============================================================
  {
    name: "Téléphones / Électronique",
    subCategories: [
      { name: "Coque", weight: 0.2 },
      { name: "Protection écran", weight: 0.15 },
      { name: "Câble", weight: 0.2 },
      { name: "Chargeur", weight: 0.3 },
      { name: "Powerbank", weight: 0.6 },
      { name: "Écouteurs", weight: 0.35 },
      { name: "Casque", weight: 0.75 },
      { name: "Smartphone", weight: 0.75 },
      { name: "Tablette", weight: 1.2 },
      { name: "Montre connectée", weight: 0.35 },
      { name: "Enceinte Bluetooth", weight: 1.8 },
      { name: "Appareil photo", weight: 1.4 },
      { name: "Drone", weight: 1.8 },
      { name: "Projecteur", weight: 1.8 },
      { name: "Console portable", weight: 1.0 },
      { name: "Console salon", weight: 5.5 },
      { name: "Ordinateur portable", weight: 2.8 },
      { name: "Écran PC", weight: 6.0 },
      { name: "Imprimante", weight: 7.0 },
      { name: "Routeur / Modem", weight: 0.8 },
      { name: "Caméra surveillance", weight: 1.0 },
      { name: "Clavier / Souris", weight: 1.0 },
      { name: "Stockage informatique", weight: 0.35 },
    ],
  },

  // ============================================================
  // 9. MAISON / DÉCORATION
  // ============================================================
  {
    name: "Maison / Décoration",
    subCategories: [
      { name: "Petite décoration", weight: 0.6 },
      { name: "Cadres", weight: 1.0 },
      { name: "Miroirs", weight: 2.5 },
      { name: "Lampes", weight: 1.8 },
      { name: "Rideaux", weight: 1.7 },
      { name: "Draps", weight: 1.7 },
      { name: "Couvertures", weight: 2.5 },
      { name: "Oreillers", weight: 1.2 },
      { name: "Coussins", weight: 0.75 },
      { name: "Petit tapis", weight: 2.5 },
      { name: "Tapis moyen", weight: 6.0 },
      { name: "Rangement", weight: 2.5 },
      { name: "Organisateurs", weight: 1.2 },
      { name: "Accessoires salle de bain", weight: 1.2 },
      { name: "Accessoires chambre", weight: 1.2 },
      { name: "Accessoires salon", weight: 1.8 },
      {
        name: "Meubles",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 10. CUISINE
  // ============================================================
  {
    name: "Cuisine",
    subCategories: [
      { name: "Ustensiles", weight: 0.9 },
      { name: "Vaisselle", weight: 2.5 },
      { name: "Verres / Tasses", weight: 2.0 },
      { name: "Couverts", weight: 1.0 },
      { name: "Boîtes alimentaires", weight: 1.2 },
      { name: "Gourdes / Thermos", weight: 0.85 },
      { name: "Moules pâtisserie", weight: 1.2 },
      { name: "Poêles", weight: 2.5 },
      { name: "Casseroles", weight: 3.0 },
      { name: "Batterie cuisine", weight: 6.0 },
      { name: "Accessoires café", weight: 1.2 },
      { name: "Accessoires pâtisserie", weight: 1.2 },
      {
        name: "Équipements professionnels",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 11. ÉLECTROMÉNAGER
  // ============================================================
  {
    name: "Électroménager",
    subCategories: [
      { name: "Bouilloire", weight: 1.8 },
      { name: "Blender", weight: 3.5 },
      { name: "Mixeur", weight: 2.3 },
      { name: "Cafetière", weight: 3.5 },
      { name: "Air fryer", weight: 5.5 },
      { name: "Rice cooker", weight: 4.5 },
      { name: "Fer à repasser", weight: 2.3 },
      { name: "Ventilateur", weight: 5.5 },
      { name: "Aspirateur", weight: 6.0 },
      { name: "Humidificateur", weight: 3.5 },
      { name: "Purificateur", weight: 6.0 },
      {
        name: "Gros électroménager",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 12. SPORT / FITNESS
  // ============================================================
  {
    name: "Sport / Fitness",
    subCategories: [
      { name: "Vêtements", weight: 0.6 },
      { name: "Chaussures", weight: 1.5 },
      { name: "Sac", weight: 1.4 },
      { name: "Tapis yoga", weight: 2.3 },
      { name: "Accessoires fitness", weight: 1.2 },
      { name: "Haltères légers", weight: 2.5 },
      { name: "Ballon", weight: 0.8 },
      { name: "Raquette", weight: 1.0 },
      { name: "Camping léger", weight: 2.5 },
      { name: "Skateboard", weight: 4.0 },
      {
        name: "Vélo",
        notes: "Validation manuelle requise",
      },
      {
        name: "Équipements lourds",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 13. JOUETS / LOISIRS
  // ============================================================
  {
    name: "Jouets / Loisirs",
    subCategories: [
      { name: "Petit jouet", weight: 0.6 },
      { name: "Peluche", weight: 1.0 },
      { name: "Poupée", weight: 1.2 },
      { name: "Jeux de construction", weight: 1.8 },
      { name: "Puzzle", weight: 0.9 },
      { name: "Jeu de société", weight: 1.8 },
      { name: "Jouet télécommandé", weight: 2.5 },
      { name: "Instrument léger", weight: 2.3 },
      {
        name: "Instruments lourds",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 14. BÉBÉ / PUÉRICULTURE
  // ============================================================
  {
    name: "Bébé / Puériculture",
    subCategories: [
      { name: "Biberons / Accessoires", weight: 0.6 },
      { name: "Alimentation", weight: 1.0 },
      { name: "Porte-bébé", weight: 1.8 },
      { name: "Jouets bébé", weight: 0.7 },
      { name: "Hygiène", weight: 0.75 },
      { name: "Petit équipement", weight: 1.8 },
      {
        name: "Poussette",
        notes: "Validation manuelle requise",
      },
      {
        name: "Lit bébé",
        notes: "Validation manuelle requise",
      },
      {
        name: "Siège auto",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 15. ANIMAUX
  // ============================================================
  {
    name: "Animaux",
    subCategories: [
      { name: "Collier / Laisse", weight: 0.35 },
      { name: "Harnais", weight: 0.5 },
      { name: "Jouets", weight: 0.6 },
      { name: "Gamelle", weight: 1.0 },
      { name: "Toilettage", weight: 0.6 },
      { name: "Lit petit animal", weight: 1.8 },
      { name: "Cage", weight: 3.5 },
      { name: "Transport", weight: 4.0 },
      {
        name: "Aquarium / Équipements",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 16. AUTOMOBILE / MOTO
  // ============================================================
  {
    name: "Automobile / Moto",
    subCategories: [
      { name: "Support téléphone", weight: 0.35 },
      { name: "Chargeur", weight: 0.35 },
      { name: "Accessoires intérieur", weight: 0.7 },
      { name: "Éclairage", weight: 1.2 },
      { name: "Audio", weight: 2.5 },
      { name: "Nettoyage", weight: 1.8 },
      { name: "Outils", weight: 2.5 },
      { name: "Tapis voiture", weight: 3.5 },
      { name: "Housse siège", weight: 3.5 },
      { name: "Pièce légère", weight: 2.5 },
      { name: "Pièce moyenne", weight: 6.0 },
      {
        name: "Pièce lourde",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 17. BUREAU / ÉCOLE
  // ============================================================
  {
    name: "Bureau / École",
    subCategories: [
      { name: "Stylos / Crayons", weight: 0.25 },
      { name: "Cahiers", weight: 0.6 },
      { name: "Carnets", weight: 0.35 },
      { name: "Trousse", weight: 0.35 },
      { name: "Classeurs", weight: 1.0 },
      { name: "Sac scolaire", weight: 1.2 },
      { name: "Fournitures bureau", weight: 1.2 },
      { name: "Matériel artistique", weight: 1.2 },
      { name: "Imprimante", weight: 7.0 },
      { name: "Scanner", weight: 6.0 },
      {
        name: "Mobilier bureau",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 18. OUTILS / BRICOLAGE
  // ============================================================
  {
    name: "Outils / Bricolage",
    subCategories: [
      { name: "Petit outil manuel", weight: 0.6 },
      { name: "Set outils", weight: 2.5 },
      { name: "Perceuse", weight: 3.0 },
      { name: "Visseuse", weight: 1.8 },
      { name: "Meuleuse", weight: 3.5 },
      { name: "Outil électrique", weight: 3.5 },
      { name: "Quincaillerie", weight: 2.5 },
      { name: "Équipement sécurité", weight: 1.8 },
      {
        name: "Machines",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 19. JARDIN / AGRICULTURE — REVIEW
  // ============================================================
  {
    name: "Jardin / Agriculture",
    subCategories: [
      {
        name: "Pots / Jardinières",
        notes: "Validation manuelle requise",
      },
      {
        name: "Outils jardin",
        notes: "Validation manuelle requise",
      },
      {
        name: "Irrigation légère",
        notes: "Validation manuelle requise",
      },
      {
        name: "Accessoires horticoles",
        notes: "Validation manuelle requise",
      },
      {
        name: "Petit équipement agricole",
        notes: "Validation manuelle requise",
      },
      {
        name: "Machines agricoles",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 20. ÉNERGIE / ÉLECTRICITÉ — REVIEW
  // ============================================================
  {
    name: "Énergie / Électricité",
    subCategories: [
      {
        name: "Ampoules LED",
        notes: "Validation manuelle requise",
      },
      {
        name: "Lampes solaires",
        notes: "Validation manuelle requise",
      },
      {
        name: "Câbles",
        notes: "Validation manuelle requise",
      },
      {
        name: "Prises / Interrupteurs",
        notes: "Validation manuelle requise",
      },
      {
        name: "Petits équipements électriques",
        notes: "Validation manuelle requise",
      },
      {
        name: "Petit onduleur",
        notes: "Validation manuelle requise",
      },
      {
        name: "Batterie",
        notes: "Validation manuelle requise",
      },
      {
        name: "Panneau solaire",
        notes: "Validation manuelle requise",
      },
      {
        name: "Groupe électrogène",
        notes: "Validation manuelle requise",
      },
      {
        name: "Équipement solaire lourd",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 21. CONSTRUCTION — REVIEW
  // ============================================================
  {
    name: "Construction",
    subCategories: [
      {
        name: "Quincaillerie",
        notes: "Poids réel / devis fournisseur requis",
      },
      {
        name: "Outillage",
        notes: "Poids réel / devis fournisseur requis",
      },
      {
        name: "Électricité",
        notes: "Poids réel / devis fournisseur requis",
      },
      {
        name: "Plomberie",
        notes: "Poids réel / devis fournisseur requis",
      },
      {
        name: "Sanitaire",
        notes: "Poids réel / devis fournisseur requis",
      },
      {
        name: "Éclairage",
        notes: "Poids réel / devis fournisseur requis",
      },
      {
        name: "Chantier",
        notes: "Poids réel / devis fournisseur requis",
      },
      {
        name: "Sécurité chantier",
        notes: "Poids réel / devis fournisseur requis",
      },
      {
        name: "Matériaux",
        notes: "Poids réel / devis fournisseur requis",
      },
      {
        name: "Machines",
        notes: "Poids réel / devis fournisseur requis",
      },
    ],
  },

  // ============================================================
  // 22. MÉDICAL / SANTÉ — REVIEW
  // ============================================================
  {
    name: "Médical / Santé",
    subCategories: [
      {
        name: "Instruments",
        notes: "Validation manuelle requise",
      },
      {
        name: "Diagnostic",
        notes: "Validation manuelle requise",
      },
      {
        name: "Laboratoire",
        notes: "Validation manuelle requise",
      },
      {
        name: "Dentaire",
        notes: "Validation manuelle requise",
      },
      {
        name: "Mobilier médical",
        notes: "Validation manuelle requise",
      },
      {
        name: "Orthopédie",
        notes: "Validation manuelle requise",
      },
      {
        name: "Consommables",
        notes: "Validation manuelle requise",
      },
      {
        name: "Équipements médicaux",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 23. PACKAGING / COMMERCE — REVIEW
  // ============================================================
  {
    name: "Packaging / Commerce",
    subCategories: [
      {
        name: "Sachets",
        notes: "Validation manuelle requise",
      },
      {
        name: "Cartons",
        notes: "Validation manuelle requise",
      },
      {
        name: "Boîtes",
        notes: "Validation manuelle requise",
      },
      {
        name: "Sacs shopping",
        notes: "Validation manuelle requise",
      },
      {
        name: "Étiquettes",
        notes: "Validation manuelle requise",
      },
      {
        name: "Stickers",
        notes: "Validation manuelle requise",
      },
      {
        name: "Rubans",
        notes: "Validation manuelle requise",
      },
      {
        name: "Packaging personnalisé",
        notes: "Validation manuelle requise",
      },
      {
        name: "Expédition",
        notes: "Validation manuelle requise",
      },
      {
        name: "Machines emballage",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 24. MACHINES / INDUSTRIE — REVIEW
  // ============================================================
  {
    name: "Machines / Industrie",
    subCategories: [
      {
        name: "Production",
        notes: "Validation manuelle requise",
      },
      {
        name: "Alimentaire",
        notes: "Validation manuelle requise",
      },
      {
        name: "Textile",
        notes: "Validation manuelle requise",
      },
      {
        name: "Emballage",
        notes: "Validation manuelle requise",
      },
      {
        name: "Agricole",
        notes: "Validation manuelle requise",
      },
      {
        name: "Construction",
        notes: "Validation manuelle requise",
      },
      {
        name: "CNC",
        notes: "Validation manuelle requise",
      },
      {
        name: "Compresseurs",
        notes: "Validation manuelle requise",
      },
      {
        name: "Pompes",
        notes: "Validation manuelle requise",
      },
      {
        name: "Générateurs",
        notes: "Validation manuelle requise",
      },
      {
        name: "Moteurs",
        notes: "Validation manuelle requise",
      },
      {
        name: "Équipements industriels / commerciaux",
        notes: "Validation manuelle requise",
      },
    ],
  },

  // ============================================================
  // 25. MATIÈRES PREMIÈRES — REVIEW
  // ============================================================
  {
    name: "Matières premières",
    subCategories: [
      {
        name: "Textile",
        notes: "Poids fournisseur obligatoire",
      },
      {
        name: "Cuir",
        notes: "Poids fournisseur obligatoire",
      },
      {
        name: "Plastique",
        notes: "Poids fournisseur obligatoire",
      },
      {
        name: "Métal",
        notes: "Poids fournisseur obligatoire",
      },
      {
        name: "Papier",
        notes: "Poids fournisseur obligatoire",
      },
      {
        name: "Bois",
        notes: "Poids fournisseur obligatoire",
      },
      {
        name: "Composants",
        notes: "Poids fournisseur obligatoire",
      },
      {
        name: "Matières agricoles",
        notes: "Poids fournisseur obligatoire",
      },
      {
        name: "Produits industriels",
        notes: "Poids fournisseur obligatoire",
      },
    ],
  },

  // ============================================================
  // 26. SÉCURITÉ — REVIEW
  // ============================================================
  {
    name: "Sécurité",
    subCategories: [
      {
        name: "Caméras",
        notes: "Validation manuelle requise",
      },
      {
        name: "Alarmes",
        notes: "Validation manuelle requise",
      },
      {
        name: "Serrures",
        notes: "Validation manuelle requise",
      },
      {
        name: "Contrôle accès",
        notes: "Validation manuelle requise",
      },
      {
        name: "Coffres",
        notes: "Validation manuelle requise",
      },
      {
        name: "Équipements sécurité",
        notes: "Validation manuelle requise",
      },
      {
        name: "Équipements professionnels",
        notes: "Validation manuelle requise",
      },
    ],
  },
];


async function main() {
  const overwrite = process.env.SEED_OVERWRITE === "true";

  console.log("🌱 Démarrage du seed A&T Market...\n");
  console.log(`Base visée : ${new URL(process.env.DATABASE_URL!).host}`);
  console.log(
    overwrite
      ? "Mode : ÉCRASEMENT (SEED_OVERWRITE=true) : les données existantes seront remises aux valeurs du seed"
      : "Mode : sûr (seul ce qui manque est créé, rien d'existant n'est modifié)"
  );
  console.log("");

  // ============================================================
  // GLOBAL SETTINGS (jamais écrasés)
  // ============================================================

  const settings = await prisma.globalSettings.findFirst();

  if (!settings) {
    await prisma.globalSettings.create({
      data: {
        chinaPricePerKg: 14,
        commissionRate: 15,
        fixedFee: 8,
      },
    });
    console.log("✓ GlobalSettings créées");
  } else {
    console.log("✓ GlobalSettings déjà présentes (non modifiées)");
  }

  const stats = {
    categoriesCreated: 0,
    categoriesExisting: 0,
    subCategoriesCreated: 0,
    subCategoriesExisting: 0,
    weightsCreated: 0,
    weightsExisting: 0,
  };

  // ============================================================
  // CATALOG
  // ============================================================

  for (const categoryData of catalog) {
    const categorySlug = slugify(categoryData.name);

    let category = await prisma.category.findUnique({
      where: { slug: categorySlug },
    });

    if (!category) {
      category = await prisma.category.create({
        data: { name: categoryData.name, slug: categorySlug, isActive: true },
      });
      stats.categoriesCreated++;
    } else {
      stats.categoriesExisting++;
      if (overwrite) {
        category = await prisma.category.update({
          where: { id: category.id },
          data: { name: categoryData.name, isActive: true },
        });
      }
    }

    for (const subCategoryData of categoryData.subCategories) {
      const subCategorySlug = slugify(
        `${categoryData.name}-${subCategoryData.name}`
      );

      let subCategory = await prisma.subCategory.findUnique({
        where: { slug: subCategorySlug },
      });

      if (!subCategory) {
        subCategory = await prisma.subCategory.create({
          data: {
            name: subCategoryData.name,
            slug: subCategorySlug,
            categoryId: category.id,
            isActive: true,
            description: subCategoryData.notes ?? null,
          },
        });
        stats.subCategoriesCreated++;
      } else {
        stats.subCategoriesExisting++;
        if (overwrite) {
          subCategory = await prisma.subCategory.update({
            where: { id: subCategory.id },
            data: {
              name: subCategoryData.name,
              categoryId: category.id,
              isActive: true,
              description: subCategoryData.notes ?? null,
            },
          });
        }
      }

      // ========================================================
      // POIDS DU CATALOGUE
      // ========================================================

      const existingWeight = await prisma.weightCatalog.findUnique({
        where: { subCategoryId: subCategory.id },
      });

      if (subCategoryData.weight !== undefined) {
        if (!existingWeight) {
          await prisma.weightCatalog.create({
            data: {
              subCategoryId: subCategory.id,
              estimatedWeightKg: subCategoryData.weight,
              notes: subCategoryData.notes ?? null,
            },
          });
          stats.weightsCreated++;
        } else {
          stats.weightsExisting++;
          if (overwrite) {
            await prisma.weightCatalog.update({
              where: { subCategoryId: subCategory.id },
              data: {
                estimatedWeightKg: subCategoryData.weight,
                notes: subCategoryData.notes ?? null,
              },
            });
          }
        }
      } else if (overwrite) {
        // Ancien comportement, uniquement sur demande explicite :
        // une sous-catégorie sans poids dans le seed perd son poids catalogué.
        await prisma.weightCatalog.deleteMany({
          where: { subCategoryId: subCategory.id },
        });
      }
    }
  }

  // ============================================================
  // RÉSUMÉ
  // ============================================================

  console.log("\n====================================");
  console.log("🌱 SEED A&T MARKET TERMINÉ");
  console.log("====================================");
  console.log(
    `Catégories       : ${stats.categoriesCreated} créées, ${stats.categoriesExisting} déjà présentes`
  );
  console.log(
    `Sous-catégories  : ${stats.subCategoriesCreated} créées, ${stats.subCategoriesExisting} déjà présentes`
  );
  console.log(
    `Poids catalogués : ${stats.weightsCreated} créés, ${stats.weightsExisting} déjà présents`
  );
  console.log("====================================\n");
}

main()
  .catch((error) => {
    console.error("❌ Erreur pendant le seed :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });