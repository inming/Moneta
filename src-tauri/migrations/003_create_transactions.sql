-- up
CREATE TABLE IF NOT EXISTS transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT    NOT NULL,
    type         TEXT    NOT NULL CHECK(type IN ('expense', 'income')),
    amount       REAL    NOT NULL CHECK(amount > 0),
    category_id  INTEGER NOT NULL REFERENCES categories(id),
    description  TEXT    DEFAULT '',
    operator_id  INTEGER DEFAULT NULL REFERENCES operators(id),
    created_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_date      ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type      ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category  ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_operator  ON transactions(operator_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date_type ON transactions(date, type);

-- down
DROP INDEX IF EXISTS idx_transactions_date_type;
DROP INDEX IF EXISTS idx_transactions_operator;
DROP INDEX IF EXISTS idx_transactions_category;
DROP INDEX IF EXISTS idx_transactions_type;
DROP INDEX IF EXISTS idx_transactions_date;
DROP TABLE IF EXISTS transactions;
