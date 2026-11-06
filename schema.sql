DROP TABLE IF EXISTS posts;
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  phone TEXT NOT NULL,
  product TEXT,
  password_hash TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'consult',
  is_secret INTEGER NOT NULL DEFAULT 1,
  reply TEXT,
  replied_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0,
  lock_until INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+9 hours')),
  updated_at TEXT
);
CREATE INDEX idx_posts_created ON posts (created_at DESC);
CREATE INDEX idx_posts_owner ON posts (author, phone);

CREATE TABLE IF NOT EXISTS click_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  fp TEXT,
  ua TEXT,
  ua_hash TEXT,
  ref TEXT,
  keyword TEXT,
  path TEXT,
  is_naver INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL DEFAULT 'allow',
  reason TEXT,
  asn TEXT,
  org TEXT,
  country TEXT,
  region TEXT,
  dwell INTEGER,
  depth INTEGER,
  moved INTEGER,
  is_known INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+9 hours'))
);
CREATE INDEX IF NOT EXISTS idx_click_ip ON click_logs (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_time ON click_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_fp ON click_logs (fp, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_action ON click_logs (action, created_at DESC);

CREATE TABLE IF NOT EXISTS blocked_ips (
  ip TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'block',
  reason TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  hit_count INTEGER NOT NULL DEFAULT 0,
  blocked_until TEXT,
  manual INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  fp TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+9 hours'))
);
CREATE INDEX IF NOT EXISTS idx_block_mode ON blocked_ips (mode, blocked_until);
