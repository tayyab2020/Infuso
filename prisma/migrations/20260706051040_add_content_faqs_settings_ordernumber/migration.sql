-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "orderNumber" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "baseNote" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "editorialLine" TEXT,
ADD COLUMN     "editorialStory" TEXT,
ADD COLUMN     "editorialTallImageUrl" TEXT,
ADD COLUMN     "editorialWideImageUrl" TEXT,
ADD COLUMN     "heartNote" TEXT,
ADD COLUMN     "hoverImageUrl" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "inspiredBy" TEXT,
ADD COLUMN     "priceOld" INTEGER,
ADD COLUMN     "tagline" TEXT,
ADD COLUMN     "topNote" TEXT;

-- CreateTable
CREATE TABLE "Faq" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "logoUrl" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "contactEmail" TEXT,
    "whatsappNumber" TEXT,
    "bankAccountName" TEXT,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "bankIban" TEXT,
    "bankQrImageUrl" TEXT,
    "mailFromName" TEXT,
    "mailFromAddress" TEXT,
    "codEmailSubject" TEXT,
    "codEmailIntro" TEXT,
    "bankEmailSubject" TEXT,
    "bankEmailIntro" TEXT,
    "houseEyebrow" TEXT,
    "houseHeading" TEXT,
    "houseBody" TEXT,
    "editorialEyebrow" TEXT,
    "editorialHeading" TEXT,
    "editorialBody" TEXT,
    "discoveryEyebrow" TEXT,
    "discoveryHeading" TEXT,
    "discoveryBody" TEXT,
    "faqEyebrow" TEXT,
    "faqHeading" TEXT,
    "footerCopyright" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

