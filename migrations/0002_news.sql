CREATE TABLE jsp_news_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT,
  source_hash TEXT,
  checked_at INTEGER NOT NULL DEFAULT 0,
  retry_after INTEGER NOT NULL DEFAULT 0,
  refresh_token TEXT
);
INSERT INTO jsp_news_cache (id) VALUES (1);
