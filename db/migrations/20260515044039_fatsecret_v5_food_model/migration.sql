/*
  Warnings:

  - You are about to drop the column `calories` on the `MealEntry` table. All the data in the column will be lost.
  - You are about to drop the column `carbs` on the `MealEntry` table. All the data in the column will be lost.
  - You are about to drop the column `fat` on the `MealEntry` table. All the data in the column will be lost.
  - You are about to drop the column `foodName` on the `MealEntry` table. All the data in the column will be lost.
  - You are about to drop the column `protein` on the `MealEntry` table. All the data in the column will be lost.
  - You are about to drop the column `servingSize` on the `MealEntry` table. All the data in the column will be lost.
  - You are about to drop the column `servingUnit` on the `MealEntry` table. All the data in the column will be lost.
  - You are about to drop the column `calories` on the `MealPresetItem` table. All the data in the column will be lost.
  - You are about to drop the column `carbs` on the `MealPresetItem` table. All the data in the column will be lost.
  - You are about to drop the column `fat` on the `MealPresetItem` table. All the data in the column will be lost.
  - You are about to drop the column `foodName` on the `MealPresetItem` table. All the data in the column will be lost.
  - You are about to drop the column `protein` on the `MealPresetItem` table. All the data in the column will be lost.
  - You are about to drop the column `servings` on the `MealPresetItem` table. All the data in the column will be lost.
  - You are about to drop the `CustomFood` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `caloriesSnapshot` to the `MealEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `carbsSnapshot` to the `MealEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fatSnapshot` to the `MealEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `foodNameSnapshot` to the `MealEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `proteinSnapshot` to the `MealEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `foodNameSnapshot` to the `MealPresetItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `servingId` to the `MealPresetItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "CustomFood" DROP CONSTRAINT "CustomFood_userId_fkey";

-- Destructive: the new schema adds required (NOT NULL, no default) snapshot
-- columns to MealEntry and MealPresetItem, which Postgres rejects on a
-- non-empty table. The food model overhaul made the legacy rows untranslatable,
-- so we drop existing rows here. The app was in alpha when this migration was
-- written and the project owner accepted the data loss; do NOT copy this
-- pattern in later migrations.
TRUNCATE TABLE "MealEntry", "MealPresetItem", "CustomFood" RESTART IDENTITY CASCADE;

-- AlterTable
ALTER TABLE "MealEntry" DROP COLUMN "calories",
DROP COLUMN "carbs",
DROP COLUMN "fat",
DROP COLUMN "foodName",
DROP COLUMN "protein",
DROP COLUMN "servingSize",
DROP COLUMN "servingUnit",
ADD COLUMN     "addedSugarsSnapshot" DOUBLE PRECISION,
ADD COLUMN     "brandNameSnapshot" TEXT,
ADD COLUMN     "caloriesSnapshot" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "carbsSnapshot" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "fatSnapshot" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "fiberSnapshot" DOUBLE PRECISION,
ADD COLUMN     "foodNameSnapshot" TEXT NOT NULL,
ADD COLUMN     "proteinSnapshot" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "saturatedFatSnapshot" DOUBLE PRECISION,
ADD COLUMN     "servingDescSnapshot" TEXT,
ADD COLUMN     "servingId" TEXT,
ADD COLUMN     "sodiumSnapshot" DOUBLE PRECISION,
ADD COLUMN     "sugarSnapshot" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "MealPresetItem" DROP COLUMN "calories",
DROP COLUMN "carbs",
DROP COLUMN "fat",
DROP COLUMN "foodName",
DROP COLUMN "protein",
DROP COLUMN "servings",
ADD COLUMN     "foodNameSnapshot" TEXT NOT NULL,
ADD COLUMN     "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "servingDescSnapshot" TEXT,
ADD COLUMN     "servingId" TEXT NOT NULL;

-- DropTable
DROP TABLE "CustomFood";

-- CreateTable
CREATE TABLE "Food" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fatSecretFoodId" INTEGER,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "brandName" TEXT,
    "foodType" TEXT NOT NULL,
    "foodUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodServing" (
    "id" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "fatSecretServingId" INTEGER,
    "description" TEXT NOT NULL,
    "metricAmount" DOUBLE PRECISION,
    "metricUnit" TEXT,
    "measurementDescription" TEXT,
    "numberOfUnits" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "calories" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL,
    "carbs" DOUBLE PRECISION NOT NULL,
    "fat" DOUBLE PRECISION NOT NULL,
    "saturatedFat" DOUBLE PRECISION,
    "sugar" DOUBLE PRECISION,
    "addedSugars" DOUBLE PRECISION,
    "fiber" DOUBLE PRECISION,
    "sodium" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodServing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Food_fatSecretFoodId_key" ON "Food"("fatSecretFoodId");

-- CreateIndex
CREATE INDEX "Food_source_idx" ON "Food"("source");

-- CreateIndex
CREATE INDEX "Food_userId_idx" ON "Food"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Food_userId_name_key" ON "Food"("userId", "name");

-- CreateIndex
CREATE INDEX "FoodServing_foodId_idx" ON "FoodServing"("foodId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodServing_foodId_fatSecretServingId_key" ON "FoodServing"("foodId", "fatSecretServingId");

-- CreateIndex
CREATE INDEX "MealPresetItem_presetId_idx" ON "MealPresetItem"("presetId");

-- AddForeignKey
ALTER TABLE "MealEntry" ADD CONSTRAINT "MealEntry_servingId_fkey" FOREIGN KEY ("servingId") REFERENCES "FoodServing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Food" ADD CONSTRAINT "Food_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodServing" ADD CONSTRAINT "FoodServing_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPresetItem" ADD CONSTRAINT "MealPresetItem_servingId_fkey" FOREIGN KEY ("servingId") REFERENCES "FoodServing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
