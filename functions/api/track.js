
import { json } from './_lib.js';
import { notifyBlock } from './_notify.js';
import { clientIP, uaHash, detectSource, blockState, maybePurge, STAGE, isHosting, isCarrier, srcLabel, judgeSession, ensureSchema } from './_smartlog.js';

const BOT_UA = /(bot|crawl|spider|headless|phantom|selenium|puppeteer|playwright|curl|wget|python-requests|okhttp|scrapy|httpclient|java\/)/i;
const MAX_ACT = 30 * 60 * 1000; // 페이지당 활성 체류 상한 30분

function kst(offsetMs) {
  return new Date(Date.now() + 9 * 3600000 + (offsetMs || 0)).toISOString().slice(0, 19).replace('T', ' ');
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const waitUntil = context.waitUntil ? context.waitUntil.bind(context) : (p) => { p && p.catch && p.catch(() => {}); };
  if (!env.DB) return json({ ok: true, action: 'allow', score: 0 });

  let b = {};
  try { b = await request.json(); } catch {}
  await ensureSchema(env);

  const ip = clientIP(request);
  const cf = request.cf || {};
  const ua = request.headers.get('user-agent') || '';
  const ref = String(b.r || '').slice(0, 500);
  const kw = String(b.q || '').slice(0, 80);
  const path = String(b.p || '/').slice(0, 200);
  const fp = String(b.f || '').slice(0, 40);
  const sid = String(b.s || '').slice(0, 48);
  const isKnown = b.n === 1 ? 1 : 0;
  const actMs = Math.max(0, Math.min(MAX_ACT, Number(b.a) || 0));

  const asn = String(cf.asn || '');
  const region = [cf.region, cf.city].filter(Boolean).join(' ') || String(cf.colo || '');
  const org = String(cf.asOrganization || '');
  const country = String(cf.country || '');

  /* ── 1) 페이지 이탈/하트비트: 그 페이지의 활성 체류를 갱신하고, 증가분만 세션에 더한다 */
  if (b.op === 'upd' && b.id) {
    try {
      const prev = await env.DB.prepare('SELECT act_ms, sid FROM click_logs WHERE id = ? AND ip = ?')
        .bind(b.id, ip).first();
      if (prev) {
        const oldMs = Number(prev.act_ms) || 0;
        const delta = Math.max(0, actMs - oldMs);
        await env.DB.prepare(
          'UPDATE click_logs SET act_ms = ?, dwell = ?, depth = MAX(COALESCE(depth,1), ?), moved = MAX(COALESCE(moved,0), ?) WHERE id = ?'
        ).bind(actMs, Math.round(actMs / 1000), typeof b.v === 'number' ? b.v : 1, b.m === 1 ? 1 : 0, b.id).run();
        if (delta > 0) {
          const vsid = prev.sid || sid;
          if (vsid) {
            await env.DB.prepare(
              'UPDATE visits SET total_ms = total_ms + ?, last_at = ?, moved = MAX(COALESCE(moved,0), ?) WHERE sid = ?'
            ).bind(delta, kst(0), b.m === 1 ? 1 : 0, vsid).run();
          }
        }
      }
    } catch (e) {}
    return json({ ok: true, action: 'allow', stage: 0, updated: true });
  }

  const depth = typeof b.v === 'number' ? b.v : 1;
  const moved = b.m === 1 ? 1 : 0;

  /* ── 2) 진입/내부이동 판별 */
  const selfHost = new URL(request.url).host;
  let refHost = '';
  try { refHost = ref ? new URL(ref).host : ''; } catch {}
  const isEntry = !ref || refHost !== selfHost;

  let src = detectSource(ref, kw, b.qs);
  let testMode = b.t === 1;
  try { if (new URL(request.url).searchParams.get('sl_test') === '1') testMode = true; } catch {}
  if (testMode) src = 'naver';
  const isAd = src === 'naver' || src === 'google';
  const uh = await uaHash(ua);

  /* 테스트 모드 — 집계·차단 제외 */
  if (testMode) {
    const r = await env.DB.prepare(
      `INSERT INTO click_logs (ip, fp, ua, ua_hash, ref, keyword, path, is_naver, score, action, reason, asn, org, country, region, dwell, depth, moved, is_known, sid, act_ms)
       VALUES (?,?,?,?,?,?,?,0,0,'test','테스트',?,?,?,?,0,?,?,?,?,0)`
    ).bind(ip, fp, ua.slice(0,300), uh, ref, kw, path, String(cf.asn||''), org, country, region, depth, moved, isKnown, sid).run();
    return json({ ok: true, action: 'allow', stage: 0, score: 0, src: 'naver', testMode: true,
                  id: r.meta ? r.meta.last_row_id : null });
  }

  /* ── 3) 수동 차단/허용 */
  const st = await blockState(env, ip);
  if (st.mode === 'allow') return json({ ok: true, action: 'allow', score: 0, whitelisted: true });
  if (st.mode === 'block') {
    return json({ ok: true, action: 'block', stage: 3, score: st.row.score || 100,
      reason: st.row.reason || '차단된 접속', blockedUntil: st.row.blocked_until,
      hits: st.row.hit_count || 0, region, org });
  }

  /* ── 4) 로그 1행 (페이지뷰). 세션은 만들지 않는다 */
  const ins = await env.DB.prepare(
    `INSERT INTO click_logs (ip, fp, ua, ua_hash, ref, keyword, path, is_naver, score, action, reason, asn, org, country, region, dwell, depth, moved, is_known, sid, act_ms)
     VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,0,?,?,?,?,0)`
  ).bind(ip, fp, ua.slice(0, 300), uh, ref, kw, path, isAd ? 1 : 0,
         isEntry ? 'allow' : 'allow', isEntry ? srcLabel(src) : '내부 이동',
         String(cf.asn || ''), org, country, region, depth, moved, isKnown, sid).run();
  const logId = ins && ins.meta ? ins.meta.last_row_id : null;

  /* ── 5) 내부 이동: 세션의 페이지 수만 +1, 새 방문으로 세지 않는다 */
  if (!isEntry) {
    if (sid) {
      await env.DB.prepare(
        'UPDATE visits SET pages = pages + 1, last_at = ?, moved = MAX(COALESCE(moved,0), ?), depth = MAX(COALESCE(depth,1), ?) WHERE sid = ?'
      ).bind(kst(0), moved, depth, sid).run().catch(() => null);
    }
    return json({ ok: true, action: 'allow', stage: 0, score: 0, internal: true, src, id: logId });
  }

  /* ── 6) 새 방문(세션) 생성 */
  let ipAd = 1, fpAd = 1, fpIps = 1, asnAd = 1;
  if (isAd && asn) {
    const e = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM visits WHERE asn = ? AND is_ad = 1 AND started_at >= datetime('now','+9 hours','-30 minutes')`
    ).bind(asn).first();
    asnAd = ((e || {}).n || 0) + 1;
  }
  if (isAd) {
    if (fp) {
      const a = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM visits WHERE fp = ? AND is_ad = 1 AND started_at >= datetime('now','+9 hours','-30 minutes')`
      ).bind(fp).first();
      fpAd = ((a || {}).n || 0) + 1;
      const c = await env.DB.prepare(
        `SELECT COUNT(DISTINCT ip) AS n FROM visits WHERE fp = ? AND is_ad = 1 AND started_at >= datetime('now','+9 hours','-24 hours')`
      ).bind(fp).first();
      fpIps = ((c || {}).n || 0) + 1;
    }
    const d = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM visits WHERE ip = ? AND is_ad = 1 AND started_at >= datetime('now','+9 hours','-30 minutes')`
    ).bind(ip).first();
    ipAd = ((d || {}).n || 0) + 1;
  }

  const ev = judgeSession({
    isAd, ipAd, fpAd, fpIps, asnAd,
    totalSec: Math.round(actMs / 1000), pages: 1, moved: moved === 1,
    bot: BOT_UA.test(ua), hosting: isHosting(org), carrier: isCarrier(org), converted: false
  });

  if (sid) {
    await env.DB.prepare(
      `INSERT INTO visits (sid, fp, ip, src, is_ad, started_at, last_at, total_ms, pages, moved, depth, asn, region, org, country, ua, score, verdict, reasons)
       VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(sid) DO UPDATE SET last_at = excluded.last_at, pages = pages + 1,
         moved = MAX(COALESCE(visits.moved,0), excluded.moved), score = excluded.score,
         verdict = excluded.verdict, reasons = excluded.reasons`
    ).bind(sid, fp, ip, src, isAd ? 1 : 0, kst(0), kst(0), actMs, moved, depth, asn,
           region, org, country, ua.slice(0, 200), ev.score, ev.verdict, ev.reasons.join(' / ')).run().catch(() => null);
  }

  /* ── 7) 차단 등록 (광고 유입 + 차단 판정만) */
  let action = ev.verdict === 'block' ? 'block' : ev.verdict === 'warn' ? 'warn' : 'allow';
  let stage = ev.verdict === 'block' ? 3 : ev.verdict === 'warn' ? 2 : ev.verdict === 'watch' ? 1 : 0;
  let blockedUntil = null;

  if (action === 'block' && isAd) {
    const hours = ev.score >= STAGE.block + 60 ? 24 : 4;
    blockedUntil = kst(hours * 3600000);
    const prev = await env.DB.prepare('SELECT mode, blocked_until FROM blocked_ips WHERE ip = ?').bind(ip).first();
    const isNew = !prev || prev.mode === 'allow' || (prev.blocked_until && prev.blocked_until < kst(0));
    await env.DB.prepare(
      `INSERT INTO blocked_ips (ip, mode, reason, score, hit_count, blocked_until, manual, fp)
       VALUES (?, 'block', ?, ?, ?, ?, 0, ?)
       ON CONFLICT(ip) DO UPDATE SET reason=excluded.reason, score=excluded.score,
         hit_count=COALESCE(blocked_ips.hit_count,0)+1, blocked_until=excluded.blocked_until
       WHERE blocked_ips.manual = 0`
    ).bind(ip, ev.reasons.join(' / ') || '반복 접속', ev.score, ipAd, blockedUntil, fp).run();

    if (isNew) {
      waitUntil(notifyBlock(env, {
        ip, score: ev.score, hits: ipAd, reason: ev.reasons.join(' / ') || '반복 접속',
        region, org, country, blockedUntil, path, keyword: kw
      }));
    }
  }

  await maybePurge(env);
  return json({ ok: true, action, stage, score: ev.score, hits: ipAd, verdict: ev.verdict,
                reason: ev.reasons.join(' / '), blockedUntil, region, org, src, id: logId });
}
