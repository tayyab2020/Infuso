-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "campaignActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "campaignBannerText" TEXT,
ADD COLUMN     "campaignCode" TEXT,
ADD COLUMN     "campaignEndsAt" TIMESTAMP(3),
ADD COLUMN     "campaignLabel" TEXT,
ADD COLUMN     "campaignPriceLabel" TEXT,
ADD COLUMN     "campaignThemeColor" TEXT;
