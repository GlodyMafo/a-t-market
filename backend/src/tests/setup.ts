// Variables factices : les tests ne doivent JAMAIS utiliser ton vrai .env.
// Ce fichier doit être importé en premier dans chaque test.
export const TEST_DB_PORT = 54329;
export const FAKE_PAWAPAY_PORT = 54330;

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${TEST_DB_PORT}/postgres`;
process.env.JWT_SECRET = "secret-de-test-0123456789";
process.env.JWT_EXPIRES_IN = "1h";
process.env.PAWAPAY_API_KEY = "test";
process.env.PAWAPAY_BASE_URL = `http://127.0.0.1:${FAKE_PAWAPAY_PORT}`;
process.env.PAWAPAY_DEPOSIT_CALLBACK_URL = "http://127.0.0.1:1/callback";
process.env.APIFY_API_TOKEN = "test";