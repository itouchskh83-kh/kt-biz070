import { hash, json, MAX_FAIL, LOCK_MS } from '../../_lib.js';

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_BOUND' }, 500);
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'BAD_JSON' }, 400); }
  const id = parseInt(params.id, 10);
  if (!id) return json({ ok: false, error: 'NOT_FOUND' }, 404);

  const row = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  if (!row) return json({ ok: false, error: 'NOT_FOUND' }, 404);

  if (!row.is_secret) return json({ ok: true, post: shape(row) });

  const now = Date.now();
  if (row.lock_until && row.lock_until > now) {
    return json({ ok: false, error: 'LOCKED', retry: Math.ceil((row.lock_until - now) / 1000) }, 429);
  }

  const pw = String(b.password || '');
  if (!pw) return json({ ok: false, error: 'PASSWORD_REQUIRED' }, 401);
  if (await hash(pw) !== row.password_hash) {
    const fails = (row.fail_count || 0) + 1;
    if (fails >= MAX_FAIL) {
      await env.DB.prepare('UPDATE posts SET fail_count = 0, lock_until = ? WHERE id = ?').bind(now + LOCK_MS, id).run();
      return json({ ok: false, error: 'LOCKED', retry: Math.ceil(LOCK_MS / 1000) }, 429);
    }
    await env.DB.prepare('UPDATE posts SET fail_count = ? WHERE id = ?').bind(fails, id).run();
    return json({ ok: false, error: 'WRONG_PASSWORD', left: MAX_FAIL - fails }, 403);
  }

  if (row.fail_count || row.lock_until) {
    await env.DB.prepare('UPDATE posts SET fail_count = 0, lock_until = 0 WHERE id = ?').bind(id).run();
  }
  return json({ ok: true, post: shape(row) });
}

function shape(r) {
  return {
    id: r.id, title: r.title, content: r.content, author: r.author,
    phone: r.phone, product: r.product, date: r.created_at, updated_at: r.updated_at,
    reply: r.reply, replied_at: r.replied_at, answered: !!(r.reply && r.reply.length)
  };
}
