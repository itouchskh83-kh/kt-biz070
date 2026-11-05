import { hash, json, mask, digits, PER } from './_lib.js';
import { notify } from './_notify.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_BOUND' }, 500);
  const u = new URL(request.url);
  const page = Math.max(1, parseInt(u.searchParams.get('page') || '1', 10) || 1);
  const field = u.searchParams.get('field') || 'all';
  const q = (u.searchParams.get('q') || '').trim();
  const kind = u.searchParams.get('kind') || 'all';
  const per = Math.min(100, Math.max(1, parseInt(u.searchParams.get('per') || '0', 10) || PER));
  const days = parseInt(u.searchParams.get('days') || '0', 10) || 0;

  let where = 'WHERE 1 = 1';
  const binds = [];
  if (kind === 'consult' || kind === 'inquiry') { where += ' AND kind = ?'; binds.push(kind); }
  if (days > 0) { where += " AND created_at >= datetime('now','+9 hours','-" + days + " days')"; }
  if (q) {
    if (field === 'author') { where += ' AND author LIKE ?'; binds.push('%' + q + '%'); }
    else if (field === 'title') { where += ' AND is_secret = 0 AND title LIKE ?'; binds.push('%' + q + '%'); }
    else { where += ' AND ((is_secret = 0 AND title LIKE ?) OR author LIKE ?)'; binds.push('%' + q + '%', '%' + q + '%'); }
  }

  const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM posts ' + where).bind(...binds).first('c');
  const rows = await env.DB.prepare(
    "SELECT id, title, author, created_at, updated_at, is_secret, kind, (reply IS NOT NULL AND reply <> '') AS answered FROM posts " +
    where + ' ORDER BY id DESC LIMIT ? OFFSET ?'
  ).bind(...binds, per, (page - 1) * per).all();

  const list = (rows.results || []).map(r => ({
    id: r.id,
    title: r.is_secret ? '비밀글입니다.' : r.title,
    author: mask(r.author),
    date: r.created_at,
    edited: !!r.updated_at,
    kind: r.kind || 'consult',
    answered: !!r.answered,
    secret: !!r.is_secret
  }));

  return json({ ok: true, total: total || 0, page, per, pages: Math.max(1, Math.ceil((total || 0) / per)), list });
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_BOUND' }, 500);
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'BAD_JSON' }, 400); }

  let title = String(b.title || '').trim();
  if (!title) title = '[상담신청] ' + (String(b.product || '').trim() || '기타 문의');
  const content = String(b.content || '').trim();
  const author = String(b.author || '').trim();
  const phone = digits(b.phone);
  const product = String(b.product || '').trim();
  const password = String(b.password || '');
  const kind = b.kind === 'inquiry' ? 'inquiry' : 'consult';

  if (title.length > 120) return json({ ok: false, error: 'TITLE' }, 400);
  if (content.length < 5) return json({ ok: false, error: 'CONTENT' }, 400);
  if (author.length < 1 || author.length > 20) return json({ ok: false, error: 'AUTHOR' }, 400);
  if (phone.length < 9 || phone.length > 11) return json({ ok: false, error: 'PHONE' }, 400);
  if (kind === 'inquiry' && !/^\d{6}$/.test(password)) return json({ ok: false, error: 'PASSWORD' }, 400);

  const hashv = await hash(password || (crypto.randomUUID() + Date.now()));
  const res = await env.DB.prepare(
    'INSERT INTO posts (title, content, author, phone, product, password_hash, is_secret, kind) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(title, content, author, phone, product, hashv, kind === 'inquiry' ? 1 : 0, kind).run();

  const id = res.meta ? res.meta.last_row_id : null;
  const task = notify(env, { title, content, author, phone, product, kind });
  if (waitUntil) waitUntil(task); else await task;

  return json({ ok: true, id });
}
