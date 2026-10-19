-- US9 (T097) — PostgreSQL-native search projection (data-model §5, research.md §8).
--
-- `search_document` is a STORED generated column so the projection is always in
-- sync with the row and needs no application write path. The expression is
-- IMMUTABLE (required of a generated column) and uses the language-neutral
-- `simple` config so Arabic is not stemmed by an English dictionary.
--
-- `pg_trgm` supplies the substring/prefix matching that tsvector cannot.
--
-- Publication filtering is deliberately NOT baked into a partial index: the
-- predicates differ per entity (Supplier adds disclosureApproved), so they stay
-- at the query layer where they cannot be bypassed.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Product
ALTER TABLE "Product"
  ADD COLUMN "search_document" tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(lower("nameEn"), '') || ' ' || coalesce(lower("nameAr"), '') || ' ' || coalesce(lower("summaryEn"), '') || ' ' || coalesce(lower("summaryAr"), '') || ' ' || coalesce(lower("descriptionEn"), '') || ' ' || coalesce(lower("descriptionAr"), ''))
  ) STORED;

CREATE INDEX "Product_search_document_idx" ON "Product" USING GIN ("search_document");
CREATE INDEX "Product_slugEn_trgm_idx" ON "Product" USING GIN ("slugEn" gin_trgm_ops);
CREATE INDEX "Product_slugAr_trgm_idx" ON "Product" USING GIN ("slugAr" gin_trgm_ops);
CREATE INDEX "Product_nameEn_trgm_idx" ON "Product" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX "Product_nameAr_trgm_idx" ON "Product" USING GIN ("nameAr" gin_trgm_ops);

-- Brand
ALTER TABLE "Brand"
  ADD COLUMN "search_document" tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(lower("nameEn"), '') || ' ' || coalesce(lower("nameAr"), '') || ' ' || coalesce(lower("summaryEn"), '') || ' ' || coalesce(lower("summaryAr"), ''))
  ) STORED;

CREATE INDEX "Brand_search_document_idx" ON "Brand" USING GIN ("search_document");
CREATE INDEX "Brand_slugEn_trgm_idx" ON "Brand" USING GIN ("slugEn" gin_trgm_ops);
CREATE INDEX "Brand_slugAr_trgm_idx" ON "Brand" USING GIN ("slugAr" gin_trgm_ops);
CREATE INDEX "Brand_nameEn_trgm_idx" ON "Brand" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX "Brand_nameAr_trgm_idx" ON "Brand" USING GIN ("nameAr" gin_trgm_ops);

-- Supplier
ALTER TABLE "Supplier"
  ADD COLUMN "search_document" tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(lower("nameEn"), '') || ' ' || coalesce(lower("nameAr"), '') || ' ' || coalesce(lower("summaryEn"), '') || ' ' || coalesce(lower("summaryAr"), '') || ' ' || coalesce(lower("descriptionEn"), '') || ' ' || coalesce(lower("descriptionAr"), ''))
  ) STORED;

CREATE INDEX "Supplier_search_document_idx" ON "Supplier" USING GIN ("search_document");
CREATE INDEX "Supplier_slugEn_trgm_idx" ON "Supplier" USING GIN ("slugEn" gin_trgm_ops);
CREATE INDEX "Supplier_slugAr_trgm_idx" ON "Supplier" USING GIN ("slugAr" gin_trgm_ops);
CREATE INDEX "Supplier_nameEn_trgm_idx" ON "Supplier" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX "Supplier_nameAr_trgm_idx" ON "Supplier" USING GIN ("nameAr" gin_trgm_ops);

-- Category
ALTER TABLE "Category"
  ADD COLUMN "search_document" tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(lower("nameEn"), '') || ' ' || coalesce(lower("nameAr"), '') || ' ' || coalesce(lower("descriptionEn"), '') || ' ' || coalesce(lower("descriptionAr"), ''))
  ) STORED;

CREATE INDEX "Category_search_document_idx" ON "Category" USING GIN ("search_document");
CREATE INDEX "Category_slugEn_trgm_idx" ON "Category" USING GIN ("slugEn" gin_trgm_ops);
CREATE INDEX "Category_slugAr_trgm_idx" ON "Category" USING GIN ("slugAr" gin_trgm_ops);
CREATE INDEX "Category_nameEn_trgm_idx" ON "Category" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX "Category_nameAr_trgm_idx" ON "Category" USING GIN ("nameAr" gin_trgm_ops);
