-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "orderNumber" DROP DEFAULT,
ALTER COLUMN "orderNumber" SET DATA TYPE TEXT;
DROP SEQUENCE "Order_orderNumber_seq";
