const SALT = 'soony-b2c-2026';

export async function hash(pw) {
  const data = new TextEncoder().encode(SALT + ':' + pw);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export function mask(name) {
  const n = String(name || '').trim();
  if (n.length <= 1) return '*';
  if (n.length === 2) return n[0] + '*';
  return n[0] + '*'.repeat(n.length - 2) + n[n.length - 1];
}

export function digits(v) {
  return String(v || '').replace(/\D/g, '');
}

export function fmtPhone(d) {
  const s = digits(d);
  if (s.length === 11) return s.slice(0, 3) + '-' + s.slice(3, 7) + '-' + s.slice(7);
  if (s.length === 10) return s.slice(0, 3) + '-' + s.slice(3, 6) + '-' + s.slice(6);
  if (s.length === 9) return s.slice(0, 2) + '-' + s.slice(2, 5) + '-' + s.slice(5);
  return s;
}

export const PER = 12;
export const MAX_FAIL = 5;
export const LOCK_MS = 60 * 1000;
