-- up
ALTER TABLE transactions ADD COLUMN is_occasional INTEGER NOT NULL DEFAULT 0;

-- down
-- SQLite does not support DROP COLUMN in older versions; column can remain
