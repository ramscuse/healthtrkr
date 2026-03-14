-- CreateTable
CREATE TABLE "CustomFood" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL,
    "carbs" DOUBLE PRECISION NOT NULL,
    "fat" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomFood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPreset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPresetItem" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "foodName" TEXT NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL,
    "carbs" DOUBLE PRECISION NOT NULL,
    "fat" DOUBLE PRECISION NOT NULL,
    "servings" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "MealPresetItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomFood_userId_name_key" ON "CustomFood"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MealPreset_userId_name_key" ON "MealPreset"("userId", "name");

-- AddForeignKey
ALTER TABLE "CustomFood" ADD CONSTRAINT "CustomFood_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPreset" ADD CONSTRAINT "MealPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPresetItem" ADD CONSTRAINT "MealPresetItem_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "MealPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
