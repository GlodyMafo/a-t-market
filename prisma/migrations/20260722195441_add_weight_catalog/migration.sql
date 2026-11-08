-- CreateTable
CREATE TABLE "WeightCatalog" (
    "id" TEXT NOT NULL,
    "subCategoryId" TEXT NOT NULL,
    "estimatedWeightKg" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeightCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeightCatalog_subCategoryId_key" ON "WeightCatalog"("subCategoryId");

-- AddForeignKey
ALTER TABLE "WeightCatalog" ADD CONSTRAINT "WeightCatalog_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
