-- AlterTable
ALTER TABLE "InternationalQuote" ADD COLUMN     "productWeight" DECIMAL(10,2),
ADD COLUMN     "subCategoryId" TEXT;

-- AddForeignKey
ALTER TABLE "InternationalQuote" ADD CONSTRAINT "InternationalQuote_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
