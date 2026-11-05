import { json, mask, digits } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_BOUND' }, 500);
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'BAD_JSON' }, 400); }
  const author = String(b.author || '').trim();
  const phone = digits(b.phone);
  if (!author) return json({ ok: false, error: 'AUTHOR' }, 400);
  if (phone.length < 9) return json({ ok: false, error: 'PHONE' }, 400);

  const rows = await env.DB.prepare(
    "SELECT id, title, created_at, updated_at, is_secret, kind, (reply IS NOT NULL AND reply <> '') AS answered FROM posts " +
    "WHERE author = ? AND phone = ? ORDER BY id DESC LIMIT 50"
  ).bind(author, phone).all();

  const list = (rows.results || []).map(r => ({
    id: r.id,
    title: r.is_secret ? '비밀글입니다.' : r.title,
    date: r.created_at,
    edited: !!r.updated_at,
    kind: r.kind || 'consult',
    answered: !!r.answered
  }));
  return json({ ok: true, author: mask(author), total: list.length, list });
}
