-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "saleEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "lowStockThreshold" INTEGER DEFAULT 5;
