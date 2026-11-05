import { hash, json, digits } from '../../_lib.js';

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_BOUND' }, 500);
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'BAD_JSON' }, 400); }
  const id = parseInt(params.id, 10);
  const row = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  if (!row) return json({ ok: false, error: 'NOT_FOUND' }, 404);
  if (row.reply) return json({ ok: false, error: 'ALREADY_ANSWERED' }, 409);
  if (await hash(String(b.password || '')) !== row.password_hash) return json({ ok: false, error: 'WRONG_PASSWORD' }, 403);

  const title = String(b.title || '').trim();
  const content = String(b.content || '').trim();
  const author = String(b.author || '').trim();
  const phone = digits(b.phone);
  if (title.length < 2) return json({ ok: false, error: 'TITLE' }, 400);
  if (content.length < 5) return json({ ok: false, error: 'CONTENT' }, 400);
  if (!author) return json({ ok: false, error: 'AUTHOR' }, 400);
  if (phone.length < 9) return json({ ok: false, error: 'PHONE' }, 400);

  await env.DB.prepare(
    "UPDATE posts SET title = ?, content = ?, author = ?, phone = ?, product = ?, updated_at = datetime('now','+9 hours') WHERE id = ?"
  ).bind(title, content, author, phone, String(b.product || '').trim(), id).run();

  return json({ ok: true });
}
