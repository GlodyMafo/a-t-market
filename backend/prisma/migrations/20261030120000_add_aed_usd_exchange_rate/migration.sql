ALTER TABLE "GlobalSettings"
ADD COLUMN "aedToUsdRate" DECIMAL(10,6);

ALTER TABLE "InternationalQuote"
ADD COLUMN "sourceProductPrice" DECIMAL(10,2),
ADD COLUMN "sourceCurrency" TEXT,
ADD COLUMN "exchangeRate" DECIMAL(10,6);