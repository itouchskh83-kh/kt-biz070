
import { json } from './_lib.js';
import { clientIP, evaluate, STAGE } from './_smartlog.js';
import { notifyBlock } from './_notify.js';

function csvCell(v) {
  const s = String(v == null ? '' : v).replace(/"/g, '""');
  return '"' + s + '"';
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ ok: false, error: 'ADMIN_NOT_CONFIGURED' }, 500);
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_BOUND' }, 500);
  let b = {};
  try { b = await request.json(); } catch { return json({ ok: false, error: 'BAD_JSON' }, 400); }
  if (String(b.password || '') !== env.ADMIN_PASSWORD) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);

  const op = String(b.op || 'list');

  if (op === 'list') {
    const days = Math.min(365, Math.max(1, parseInt(b.days || '7', 10) || 7));
    const sus = await env.DB.prepare(
      `SELECT ip, COUNT(*) AS hits, MAX(score) AS top, SUM(is_naver) AS naver,
              MAX(created_at) AS last, MAX(org) AS org, MAX(region) AS region,
              MAX(reason) AS reason, COUNT(DISTINCT fp) AS devices,
              ROUND(AVG(dwell),1) AS dwell, MAX(depth) AS depth
         FROM click_logs
        WHERE created_at >= datetime('now','+9 hours','-${days} days')
          AND action <> 'test'
          AND reason <> '내부 이동'
        GROUP BY ip
        HAVING hits >= 3 OR top >= 45
        ORDER BY top DESC, hits DESC
        LIMIT 300`
    ).all();
    const blocked = await env.DB.prepare(
      `SELECT * FROM blocked_ips ORDER BY created_at DESC LIMIT 300`
    ).all();
    const stat = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN action='block' THEN 1 ELSE 0 END) AS blocked,
              SUM(CASE WHEN action='warn'  THEN 1 ELSE 0 END) AS warned,
              SUM(CASE WHEN is_naver=1 THEN 1 ELSE 0 END) AS ad,
              SUM(CASE WHEN is_naver=0 AND reason='자연검색' THEN 1 ELSE 0 END) AS organic,
              SUM(CASE WHEN is_naver=0 AND reason='직접방문' THEN 1 ELSE 0 END) AS direct,
              SUM(CASE WHEN is_naver=0 AND reason='내부 이동' THEN 1 ELSE 0 END) AS internal,
              SUM(CASE WHEN is_naver=1 AND keyword IS NOT NULL AND keyword<>'' THEN 1 ELSE 0 END) AS kword,
              COUNT(DISTINCT ip) AS ips, COUNT(DISTINCT fp) AS devices
         FROM click_logs
        WHERE created_at >= datetime('now','+9 hours','-${days} days')
          AND action <> 'test'`
    ).first();
    const tstat = await env.DB.prepare(
      `SELECT COUNT(*) AS n, MAX(created_at) AS last FROM click_logs
        WHERE action='test' AND created_at >= datetime('now','+9 hours','-${days} days')`
    ).first();
    const logs = await env.DB.prepare(
      `SELECT id, ip, fp, ref, keyword, path, is_naver, score, action, reason, region, org, country,
              dwell, depth, created_at,
              (SELECT COUNT(*) FROM click_logs v WHERE v.ip = click_logs.ip AND v.action <> 'test') AS ip_visits,
              (CASE WHEN click_logs.fp IS NULL OR click_logs.fp = '' THEN 0
                    ELSE (SELECT COUNT(*) FROM click_logs v WHERE v.fp = click_logs.fp AND v.action <> 'test') END) AS fp_visits
         FROM click_logs
        WHERE created_at >= datetime('now','+9 hours','-${days} days')
          AND action <> 'test'
          AND reason <> '내부 이동'
        ORDER BY id DESC LIMIT 100`
    ).all();
    return json({ ok: true, days, myIp: clientIP(request), stat: stat || {}, test: tstat || {}, logs: logs.results || [], suspicious: sus.results || [], blocked: blocked.results || [] });
  }

  if (op === 'reset') {
    const what = String(b.target || 'logs');
    if (what === 'all') {
      await env.DB.prepare('DELETE FROM click_logs').run();
      await env.DB.prepare("DELETE FROM blocked_ips WHERE manual = 0").run();
    } else {
      await env.DB.prepare('DELETE FROM click_logs').run();
    }
    return json({ ok: true, reset: what });
  }

  if (op === 'block') {
    const ip = String(b.ip || '').trim();
    if (!ip) return json({ ok: false, error: 'NO_IP' }, 400);
    const hours = parseInt(b.hours || '0', 10); // 0 = 영구
    const until = hours > 0
      ? new Date(Date.now() + 9 * 3600000 + hours * 3600000).toISOString().slice(0, 19).replace('T', ' ')
      : null;
    await env.DB.prepare(
      `INSERT INTO blocked_ips (ip, mode, reason, score, manual, note, blocked_until)
       VALUES (?, 'block', ?, 999, 1, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET mode='block', manual=1, reason=excluded.reason,
         note=excluded.note, blocked_until=excluded.blocked_until`
    ).bind(ip, String(b.reason || '관리자 차단'), String(b.note || ''), until).run();
    await notifyBlock(env, { ip, score: 999, hits: 0, reason: '관리자 직접 차단',
      region: '-', org: String(b.note || ''), blockedUntil: until || '영구', path: '-', keyword: '' });
    return json({ ok: true });
  }

  if (op === 'allow') {
    const ip = String(b.ip || '').trim();
    if (!ip) return json({ ok: false, error: 'NO_IP' }, 400);
    await env.DB.prepare(
      `INSERT INTO blocked_ips (ip, mode, reason, score, manual, note, blocked_until)
       VALUES (?, 'allow', '허용 목록', 0, 1, ?, NULL)
       ON CONFLICT(ip) DO UPDATE SET mode='allow', manual=1, blocked_until=NULL`
    ).bind(ip, String(b.note || '')).run();
    return json({ ok: true });
  }

  if (op === 'unblock') {
    const ip = String(b.ip || '').trim();
    await env.DB.prepare('DELETE FROM blocked_ips WHERE ip = ?').bind(ip).run();
    return json({ ok: true });
  }

  if (op === 'export') {
    const days = Math.min(365, Math.max(1, parseInt(b.days || '30', 10) || 30));
    const rows = await env.DB.prepare(
      `SELECT created_at, ip, fp, keyword, path, ref, score, action, reason, org, region, country, dwell, depth, ua
         FROM click_logs
        WHERE created_at >= datetime('now','+9 hours','-${days} days')
        ORDER BY created_at DESC LIMIT 20000`
    ).all();
    const head = ['접속일시','IP','기기지문','검색키워드','방문경로','유입URL','위험점수','판정','판정사유','통신사/호스팅','접속지역','국가','체류(초)','페이지수','브라우저'];
    const lines = [head.map(csvCell).join(',')];
    for (const r of (rows.results || [])) {
      lines.push([r.created_at, r.ip, r.fp, r.keyword, r.path, r.ref, r.score, r.action,
                  r.reason, r.org, r.region, r.country, r.dwell, r.depth, r.ua].map(csvCell).join(','));
    }
    return new Response('\ufeff' + lines.join('\r\n'), {
      headers: { 'content-type': 'text/csv; charset=utf-8',
                 'content-disposition': 'attachment; filename="smartlog.csv"' }
    });
  }

  if (op === 'simulate') {
    // 현재 접속 환경 그대로, 광고 클릭 횟수만 늘려가며 판정 변화를 계산
    const ua = request.headers.get('user-agent') || '';
    const org = String((request.cf && request.cf.asOrganization) || '');
    const rows = [];
    for (let n = 1; n <= 10; n++) {
      const ev = evaluate({
        ipHits: n, fpHits: n, fpIps: Math.min(n, 3), ua, org,
        isAd: true, dwell: 8, moved: 1, depth: 3, isKnown: 1
      });
      rows.push({ clicks: n, score: ev.score, action: ev.action, stage: ev.stage,
                  reasons: ev.reasons.join(' / ') });
    }
    // 같은 기기 + IP 변경 시나리오
    const ipChange = evaluate({
      ipHits: 3, fpHits: 4, fpIps: 4, ua, org,
      isAd: true, dwell: 5, moved: 1, depth: 2, isKnown: 0
    });
    return json({ ok: true, thresholds: STAGE, org, rows, ipChange });
  }

  if (op === 'clearTest') {
    await env.DB.prepare("DELETE FROM click_logs WHERE path LIKE '%sl_test%'").run();
    return json({ ok: true });
  }

  return json({ ok: false, error: 'UNKNOWN_OP' }, 400);
}
