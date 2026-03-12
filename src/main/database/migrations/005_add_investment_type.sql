-- up

-- Step 1: Rebuild categories table with 'investment' in CHECK constraint
CREATE TABLE categories_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL CHECK(type IN ('expense', 'income', 'investment')),
    icon        TEXT    DEFAULT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_system   INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

INSERT INTO categories_new (id, name, type, icon, sort_order, is_system, is_active, created_at, updated_at)
    SELECT id, name, type, icon, sort_order, is_system, is_active, created_at, updated_at
    FROM categories;

DROP INDEX IF EXISTS idx_categories_name_type;
DROP TABLE categories;
ALTER TABLE categories_new RENAME TO categories;
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_type ON categories(name, type);

-- Step 2: Rebuild transactions table with 'investment' in CHECK constraint
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

-- Step 3: Seed default investment categories
INSERT OR IGNORE INTO categories (name, type, sort_order, is_system) VALUES
    ('基金',     'investment', 1, 1),
    ('股票',     'investment', 2, 1),
    ('理财产品', 'investment', 3, 1),
    ('保险投资', 'investment', 4, 1),
    ('房产',     'investment', 5, 1),
    ('其他投资', 'investment', 6, 1);

-- down
DELETE FROM transactions WHERE type = 'investment';
DELETE FROM categories WHERE type = 'investment';
