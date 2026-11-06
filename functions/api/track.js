
import { json } from './_lib.js';
import { notifyBlock } from './_notify.js';
import { clientIP, uaHash, detectSource, evaluate, blockState, maybePurge, STAGE, WINDOW_MIN, isHosting, srcLabel } from './_smartlog.js';

// 한국시간 문자열 (YYYY-MM-DD HH:MM:SS)
function kst(offsetMs) {
  return new Date(Date.now() + 9 * 3600000 + (offsetMs || 0)).toISOString().slice(0, 19).replace('T', ' ');
}
// 로그를 먼저 남기고, 외부 지오IP 결과로 지역명을 덮어쓴다.



export async function onRequestPost(context) {
  const { request, env } = context;
  const waitUntil = context.waitUntil ? context.waitUntil.bind(context) : (p) => { p && p.catch && p.catch(() => {}); };
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

  // 페이지 이탈 시에는 '새 접속'이 아니라 체류시간만 갱신한다 (중복 집계 방지)
  if (b.op === 'upd' && b.id) {
    try {
      await env.DB.prepare(
        'UPDATE click_logs SET dwell = ?, depth = MAX(COALESCE(depth,1), ?), moved = MAX(COALESCE(moved,0), ?) WHERE id = ? AND ip = ?'
      ).bind(dwell, depth, moved, b.id, ip).run();
    } catch (e) {}
    return json({ ok: true, action: 'allow', stage: 0, updated: true });
  }
  const dwell = typeof b.d === 'number' ? b.d : null;
  const depth = typeof b.v === 'number' ? b.v : 1;
  const moved = b.m === 1 ? 1 : 0;
  // ── 진입 판별: 내부 페이지 이동은 '새 클릭'이 아니다
  const selfHost = new URL(request.url).host;
  let refHost = '';
  try { refHost = ref ? new URL(ref).host : ''; } catch {}
  const isEntry = !ref || refHost !== selfHost;
  let src = detectSource(ref, kw, b.qs);
  let testMode = b.t === 1;
  try {
    if (new URL(request.url).searchParams.get('sl_test') === '1') testMode = true;
  } catch {}
  if (testMode) src = 'naver';
  const isNaver = src === 'naver';
  const isAd = src === 'naver' || src === 'google';
  const uh = await uaHash(ua);

  const region = [cf.region, cf.city].filter(Boolean).join(' ') || String(cf.colo || '');
  const org = String(cf.asOrganization || '');
  const country = String(cf.country || '');

  // [테스트 모드] 채점·차단·집계에서 완전히 제외하고 별도 기록만 남깁니다.
  if (testMode) {
    const r = await env.DB.prepare(
      `INSERT INTO click_logs (ip, fp, ua, ua_hash, ref, keyword, path, is_naver, score, action, reason, asn, org, country, region, dwell, depth, moved, is_known)
       VALUES (?,?,?,?,?,?,?,0,0,'test','테스트',?,?,?,?,?,?,?,?)`
    ).bind(ip, fp, ua.slice(0,300), uh, ref, kw, path, String(cf.asn||''), org, country, region, dwell, depth, moved, isKnown).run();
    return json({ ok: true, action: 'allow', stage: 0, score: 0, src: 'naver', testMode: true,
                  id: r.meta ? r.meta.last_row_id : null });
  }

  // 1) 수동 차단/허용
  const st = await blockState(env, ip);
  if (st.mode === 'allow') return json({ ok: true, action: 'allow', score: 0, whitelisted: true });
  if (st.mode === 'block') {
    return json({ ok: true, action: 'block', stage: 3, score: st.row.score || 100,
      reason: st.row.reason || '차단된 접속', blockedUntil: st.row.blocked_until,
      hits: st.row.hit_count || 0, region, org });
  }

  // 내부 페이지 이동은 로그만 남기고 즉시 통과
  if (!isEntry) {
    await env.DB.prepare(
      `INSERT INTO click_logs (ip, fp, ua, ua_hash, ref, keyword, path, is_naver, score, action, reason, asn, org, country, region, dwell, depth, moved, is_known)
       VALUES (?,?,?,?,?,?,?,0,0,'allow','내부 이동',?,?,?,?,?,?,?,?)`
    ).bind(ip, fp, ua.slice(0,300), uh, ref, kw, path, String(cf.asn||''), org, country, region,
           dwell, depth, moved, isKnown).run();
    return json({ ok: true, action: 'allow', stage: 0, score: 0, internal: true, src, lastId: null });
  }

  // 2) 집계 — '광고 유입' 기록만 센다 (직접 방문은 카운트 제외)
  const win = `datetime('now','+9 hours','-${WINDOW_MIN} minutes')`;
  let ipHits = 1, fpHits = 1, fpIps = 1;
  if (isAd) {
    const ipAgg = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM click_logs WHERE ip = ? AND is_naver = 1 AND created_at >= ${win}`
    ).bind(ip).first();
    fpHits = fp ? (((await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM click_logs WHERE fp = ? AND is_naver = 1 AND created_at >= ${win}`
    ).bind(fp).first()) || {}).n || 0) + 1 : 1;
    fpIps = fp ? (((await env.DB.prepare(
      `SELECT COUNT(DISTINCT ip) AS n FROM click_logs WHERE fp = ? AND is_naver = 1 AND created_at >= ${win}`
    ).bind(fp).first()) || {}).n || 0) + 1 : 1;
    ipHits = ((ipAgg || {}).n || 0) + 1;
  }

  // 3) 판정
  const ev = evaluate({ ipHits, fpHits, fpIps, ua, org, isAd, dwell, moved, depth, isKnown });
  let action = ev.action, stage = ev.stage;

  // 4) 실제 상담 완료 IP 는 보호
  if (action === 'block') {
    const ok = await env.DB.prepare(
      `SELECT 1 AS c FROM blocked_ips WHERE ip = ? AND mode = 'allow'`
    ).bind(ip).first();
    if (ok) { action = 'allow'; stage = 0; }
  }

  // 5) 로그 (365일 보관)
  const reason = isAd ? ev.reasons.join(' / ') : srcLabel(src);
  const ins = await env.DB.prepare(
    `INSERT INTO click_logs (ip, fp, ua, ua_hash, ref, keyword, path, is_naver, score, action, reason, asn, org, country, region, dwell, depth, moved, is_known)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(ip, fp, ua.slice(0, 300), uh, ref, kw, path, isNaver ? 1 : 0, ev.score, action,
         reason, String(cf.asn || ''), org, country, region,
         dwell, depth, moved, isKnown).run();
  const logId = ins && ins.meta ? ins.meta.last_row_id : null;

  // 6) 차단 등록
  let blockedUntil = null;
  if (action === 'block' && isAd) {
    const hours = ev.score >= STAGE.block + 60 ? 24 : 4;
    blockedUntil = kst(hours * 3600000);
    const prev = await env.DB.prepare('SELECT mode, blocked_until FROM blocked_ips WHERE ip = ?').bind(ip).first();
    const isNew = !prev || prev.mode === 'allow'
      || (prev.blocked_until && prev.blocked_until < kst(0));
    await env.DB.prepare(
      `INSERT INTO blocked_ips (ip, mode, reason, score, hit_count, blocked_until, manual, fp)
       VALUES (?, 'block', ?, ?, ?, ?, 0, ?)
       ON CONFLICT(ip) DO UPDATE SET reason=excluded.reason, score=excluded.score,
         hit_count=COALESCE(blocked_ips.hit_count,0)+1, blocked_until=excluded.blocked_until
       WHERE blocked_ips.manual = 0`
    ).bind(ip, reason || '반복 접속', ev.score, ipHits, blockedUntil, fp).run();

    if (isNew) {
      waitUntil(notifyBlock(env, {
        ip, score: ev.score, hits: ipHits, reason: reason || '반복 접속',
        region, org, country, blockedUntil, path, keyword: kw
      }));
    }
  }

  await maybePurge(env);
  return json({ ok: true, action, stage, score: ev.score, hits: ipHits,
                reason, blockedUntil, region, org, fpDetected: fpHits > 1, fpIps, src, testMode, id: logId });
}
