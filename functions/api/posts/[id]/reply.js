import { json } from '../../_lib.js';

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_BOUND' }, 500);
  if (!env.ADMIN_PASSWORD) return json({ ok: false, error: 'ADMIN_NOT_CONFIGURED' }, 500);
  if ((request.headers.get('x-admin') || '') !== env.ADMIN_PASSWORD) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'BAD_JSON' }, 400); }
  const reply = String(b.reply || '').trim();
  if (reply.length < 2) return json({ ok: false, error: 'REPLY' }, 400);
  await env.DB.prepare("UPDATE posts SET reply = ?, replied_at = datetime('now','+9 hours') WHERE id = ?")
    .bind(reply, parseInt(params.id, 10)).run();
  return json({ ok: true });
}
