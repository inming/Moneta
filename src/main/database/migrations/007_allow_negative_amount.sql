-- up

-- Rebuild transactions table: change CHECK(amount > 0) to CHECK(amount != 0) to allow negative amounts (refunds)
CREATE TABLE transactions_new (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT    NOT NULL,
    type         TEXT    NOT NULL CHECK(type IN ('expense', 'income', 'investment')),
    amount       REAL    NOT NULL CHECK(amount != 0),
    category_id  INTEGER NOT NULL REFERENCES categories(id),
    description  TEXT    DEFAULT '',
    operator_id  INTEGER DEFAULT NULL REFERENCES operators(id),
    created_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

INSERT INTO transactions_new (id, date, type, amount, category_id, description, operator_id, created_at, updated_at)
    SELECT id, date, type, amount, category_id, description, operator_id, created_at, updated_at
    FROM transactions;

DROP INDEX IF EXISTS idx_transactions_date_type;
DROP INDEX IF EXISTS idx_transactions_operator;
DROP INDEX IF EXISTS idx_transactions_category;
DROP INDEX IF EXISTS idx_transactions_type;
DROP INDEX IF EXISTS idx_transactions_date;
DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

CREATE INDEX IF NOT EXISTS idx_transactions_date      ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type      ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category  ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_operator  ON transactions(operator_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date_type ON transactions(date, type);

-- down

CREATE TABLE transactions_new (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT    NOT NULL,
    type         TEXT    NOT NULL CHECK(type IN ('expense', 'income', 'investment')),
    amount       REAL    NOT NULL CHECK(amount > 0),
    category_id  INTEGER NOT NULL REFERENCES categories(id),
    description  TEXT    DEFAULT '',
    operator_id  INTEGER DEFAULT NULL REFERENCES operators(id),
    created_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

INSERT INTO transactions_new (id, date, type, amount, category_id, description, operator_id, created_at, updated_at)
    SELECT id, date, type, amount, category_id, description, operator_id
    FROM transactions
    WHERE amount > 0;

DROP INDEX IF EXISTS idx_transactions_date_type;
DROP INDEX IF EXISTS idx_transactions_operator;
DROP INDEX IF EXISTS idx_transactions_category;
DROP INDEX IF EXISTS idx_transactions_type;
DROP INDEX IF EXISTS idx_transactions_date;
DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

CREATE INDEX IF NOT EXISTS idx_transactions_date      ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type      ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category  ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_operator  ON transactions(operator_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date_type ON transactions(date, type);
