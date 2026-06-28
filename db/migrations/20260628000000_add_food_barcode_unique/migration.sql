-- AddUniqueConstraint: Food(source, foodUrl) for barcode deduplication
-- NULL foodUrl values remain distinct (Postgres NULL semantics), so
-- custom and fatsecret rows without a foodUrl are unaffected.
CREATE UNIQUE INDEX "Food_source_foodUrl_key" ON "Food"("source", "foodUrl");
