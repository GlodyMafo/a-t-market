// À importer juste après ./setup : relève les limites de connexion/inscription pour les tests qui en font beaucoup.
process.env.AUTH_LOGIN_LIMIT = "1000";
process.env.AUTH_REGISTER_LIMIT = "1000";