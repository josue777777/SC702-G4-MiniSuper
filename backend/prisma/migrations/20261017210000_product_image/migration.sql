-- HU-01: imagen opcional del producto, guardada en la base.
ALTER TABLE "Product" ADD COLUMN     "imageData" BYTEA,
ADD COLUMN     "imageMimeType" TEXT,
ADD COLUMN     "imageUpdatedAt" TIMESTAMP(3);
