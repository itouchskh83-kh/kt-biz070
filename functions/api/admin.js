import { json } from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ ok: false, error: 'ADMIN_NOT_CONFIGURED' }, 500);
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'BAD_JSON' }, 400); }
  if (String(b.password || '') !== env.ADMIN_PASSWORD) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_BOUND' }, 500);
  const page = Math.max(1, parseInt(b.page || '1', 10) || 1);
  const per = Math.min(50, Math.max(1, parseInt(b.per || '10', 10) || 10));
  const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM posts').first('c');
  const rows = await env.DB.prepare('SELECT * FROM posts ORDER BY id DESC LIMIT ? OFFSET ?')
    .bind(per, (page - 1) * per).all();
  return json({ ok: true, list: rows.results || [], total: total || 0, page, per,
    pages: Math.max(1, Math.ceil((total || 0) / per)) });
}
