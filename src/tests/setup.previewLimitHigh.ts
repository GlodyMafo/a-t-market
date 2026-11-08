// À importer juste après ./setup : relève la limite d'aperçus par IP pour les tests qui en font beaucoup.
process.env.PREVIEW_RATE_LIMIT_PER_10_MIN = "1000";