
import { json } from './_lib.js';
import { clientIP, uaHash, isNaverRef, evaluate, blockState, maybePurge, STAGE, WINDOW_MIN, isHosting } from './_smartlog.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: true, action: 'allow', score: 0 });
  let b = {};
  try { b = await request.json(); } catch {}

  const ip = clientIP(request);
  const cf = request.cf || {};
  const ua = request.headers.get('user-agent') || '';
  const ref = String(b.r || '').slice(0, 500);
  const kw = String(b.q || '').slice(0, 80);
  const path = String(b.p || '/').slice(0, 200);
  const fp = String(b.f || '').slice(0, 40);
  const isKnown = b.n === 1 ? 1 : 0;
  const dwell = typeof b.d === 'number' ? b.d : null;
  const depth = typeof b.v === 'number' ? b.v : 1;
  const moved = b.m === 1 ? 1 : 0;
  const isNaver = isNaverRef(ref) || !!kw;
  const uh = await uaHash(ua);

  const region = [cf.region, cf.city].filter(Boolean).join(' ') || String(cf.colo || '');
  const org = String(cf.asOrganization || '');
  const country = String(cf.country || '');

  // 1) 수동 차단/허용
  const st = await blockState(env, ip);
  if (st.mode === 'allow') return json({ ok: true, action: 'allow', score: 0, whitelisted: true });
  if (st.mode === 'block') {
    return json({ ok: true, action: 'block', stage: 3, score: st.row.score || 100,
      reason: st.row.reason || '차단된 접속', blockedUntil: st.row.blocked_until,
      hits: st.row.hit_count || 0, region, org });
  }

  // 2) 다중 신호 집계
  const win = `datetime('now','+9 hours','-${WINDOW_MIN} minutes')`;
  const ipAgg = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM click_logs WHERE ip = ? AND created_at >= ${win}`
  ).bind(ip).first();
  const fpHits = fp ? ((await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM click_logs WHERE fp = ? AND created_at >= ${win}`
  ).bind(fp).first()) || {}).n || 0 : 0;
  const fpIps = fp ? ((await env.DB.prepare(
    `SELECT COUNT(DISTINCT ip) AS n FROM click_logs WHERE fp = ? AND created_at >= ${win}`
  ).bind(fp).first()) || {}).n || 0 : 0;

  const ipHits = ((ipAgg || {}).n || 0) + 1;

  // 3) 판정
  const ev = evaluate({ ipHits, fpHits, fpIps, ua, org, hasRef: !!ref, isNaver,
                        dwell, moved, depth, isKnown });
  let action = 'allow', stage = 0;
  if (ev.score >= STAGE.block) { action = 'block'; stage = 3; }
  else if (ev.score >= STAGE.warn) { action = 'warn'; stage = 2; }
  else if (ev.score >= STAGE.watch) { action = 'warn'; stage = 1; }

  // 4) 실제 상담 완료 IP 는 보호
  if (action === 'block') {
    const ok = await env.DB.prepare(
      `SELECT 1 AS c FROM blocked_ips WHERE ip = ? AND mode = 'allow'`
    ).bind(ip).first();
    if (ok) { action = 'allow'; stage = 0; }
  }

  // 5) 로그 (365일 보관)
  const reason = ev.reasons.join(' / ');
  await env.DB.prepare(
    `INSERT INTO click_logs (ip, fp, ua, ua_hash, ref, keyword, path, is_naver, score, action, reason, asn, org, country, region, dwell, depth, moved, is_known)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(ip, fp, ua.slice(0, 300), uh, ref, kw, path, isNaver ? 1 : 0, ev.score, action,
         reason, String(cf.asn || ''), org, country, region,
         dwell, depth, moved, isKnown).run();

  // 6) 차단 등록
  let blockedUntil = null;
  if (action === 'block') {
    const hours = ev.score >= STAGE.block + 60 ? 24 : 4;
    blockedUntil = new Date(Date.now() + hours * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await env.DB.prepare(
      `INSERT INTO blocked_ips (ip, mode, reason, score, hit_count, blocked_until, manual, fp)
       VALUES (?, 'block', ?, ?, ?, ?, 0, ?)
       ON CONFLICT(ip) DO UPDATE SET reason=excluded.reason, score=excluded.score,
         hit_count=COALESCE(blocked_ips.hit_count,0)+1, blocked_until=excluded.blocked_until
       WHERE blocked_ips.manual = 0`
    ).bind(ip, reason || '반복 접속', ev.score, ipHits, blockedUntil, fp).run();
  }

  await maybePurge(env);
  return json({ ok: true, action, stage, score: ev.score, hits: ipHits,
                reason, blockedUntil, region, org, fpDetected: fpHits > 1, fpIps });
}
