// Variables factices : les tests ne doivent JAMAIS utiliser ton vrai .env.
// Ce fichier doit être importé en premier dans chaque test.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.JWT_SECRET = "secret-de-test-0123456789";
process.env.JWT_EXPIRES_IN = "1h";
process.env.PAWAPAY_API_KEY = "test";
process.env.PAWAPAY_BASE_URL = "http://127.0.0.1:1";
process.env.PAWAPAY_DEPOSIT_CALLBACK_URL = "http://127.0.0.1:1/callback";
process.env.PAWAPAY_WEBHOOK_SECRET = "test";
process.env.APIFY_API_TOKEN = "test";