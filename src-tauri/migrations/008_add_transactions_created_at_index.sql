-- up

CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- down

DROP INDEX IF EXISTS idx_transactions_created_at;
