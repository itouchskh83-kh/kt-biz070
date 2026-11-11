import { json } from '../../_lib.js';

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_BOUND' }, 500);
  if (!env.ADMIN_PASSWORD) return json({ ok: false, error: 'ADMIN_NOT_CONFIGURED' }, 500);
  if ((request.headers.get('x-admin') || '') !== env.ADMIN_PASSWORD) {
    return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  }
  const id = parseInt(params.id, 10);
  if (!id) return json({ ok: false, error: 'BAD_ID' }, 400);
  const row = await env.DB.prepare('SELECT id, title FROM posts WHERE id = ?').bind(id).first();
  if (!row) return json({ ok: false, error: 'NOT_FOUND' }, 404);
  await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  return json({ ok: true, id, title: row.title });
}
