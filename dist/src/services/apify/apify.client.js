"use strict";
// src/services/apify/apify.client.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.apifyClient = void 0;
const apify_client_1 = require("apify-client");
const token = process.env.APIFY_API_TOKEN;
if (!token) {
    throw new Error("APIFY_API_TOKEN is not configured");
}
exports.apifyClient = new apify_client_1.ApifyClient({
    token,
});
