-- DropForeignKey
ALTER TABLE "MealPresetItem" DROP CONSTRAINT "MealPresetItem_servingId_fkey";

-- AddForeignKey
ALTER TABLE "MealPresetItem" ADD CONSTRAINT "MealPresetItem_servingId_fkey" FOREIGN KEY ("servingId") REFERENCES "FoodServing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
