-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "concentration" TEXT,
ADD COLUMN     "howToUse" TEXT,
ADD COLUMN     "ingredients" TEXT,
ADD COLUMN     "longevity" TEXT;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "deliveryInfo" TEXT,
ADD COLUMN     "returnPolicy" TEXT;

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "customerName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Review_productId_approved_idx" ON "Review"("productId", "approved");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

