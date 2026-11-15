-- NAVA BUSINESS: link a sale transaction to an active catalogue item.
-- Additive and backward-compatible: existing manual sales remain unlinked.
ALTER TABLE business_transactions_v1
  ADD COLUMN catalog_item_id TEXT REFERENCES business_catalog_items_v1(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_business_transactions_catalog_item
  ON business_transactions_v1 (business_id, owner_id, catalog_item_id);
