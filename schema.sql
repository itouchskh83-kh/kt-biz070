-- Cloudflare D1 : 1:1 문의 게시판
DROP TABLE IF EXISTS posts;
CREATE TABLE posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  content       TEXT    NOT NULL,
  author        TEXT    NOT NULL,
  phone         TEXT    NOT NULL,           -- 숫자만 저장 (01012345678)
  product       TEXT,
  password_hash TEXT    NOT NULL,
  kind          TEXT    NOT NULL DEFAULT 'consult',  -- consult(상담신청) | inquiry(1:1문의)
  is_secret     INTEGER NOT NULL DEFAULT 1,
  reply         TEXT,
  replied_at    TEXT,
  fail_count    INTEGER NOT NULL DEFAULT 0,
  lock_until    INTEGER NOT NULL DEFAULT 0, -- epoch ms
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','+9 hours')),
  updated_at    TEXT
);
CREATE INDEX idx_posts_created ON posts (created_at DESC);
CREATE INDEX idx_posts_owner   ON posts (author, phone);
