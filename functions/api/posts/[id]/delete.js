import { hash, json } from '../../_lib.js';

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_BOUND' }, 500);
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'BAD_JSON' }, 400); }
  const id = parseInt(params.id, 10);
  const row = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  if (!row) return json({ ok: false, error: 'NOT_FOUND' }, 404);
  if (row.reply) return json({ ok: false, error: 'ALREADY_ANSWERED' }, 409);
  if (await hash(String(b.password || '')) !== row.password_hash) return json({ ok: false, error: 'WRONG_PASSWORD' }, 403);
  await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
