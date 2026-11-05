import { json } from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ ok: false, error: 'ADMIN_NOT_CONFIGURED' }, 500);
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'BAD_JSON' }, 400); }
  if (String(b.password || '') !== env.ADMIN_PASSWORD) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_BOUND' }, 500);
  const rows = await env.DB.prepare('SELECT * FROM posts ORDER BY id DESC LIMIT 200').all();
  return json({ ok: true, list: rows.results || [] });
}
