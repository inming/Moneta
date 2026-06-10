-- up
CREATE TABLE IF NOT EXISTS import_draft (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- down
-- DROP TABLE IF EXISTS import_draft;
