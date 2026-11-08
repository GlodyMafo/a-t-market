// src/services/apify/apify.client.ts

import { ApifyClient } from "apify-client";

const token = process.env.APIFY_API_TOKEN;

if (!token) {
  throw new Error("APIFY_API_TOKEN is not configured");
}

export const apifyClient = new ApifyClient({
  token,
});