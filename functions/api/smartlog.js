
import { json } from './_lib.js';
import { clientIP, ensureSchema } from './_smartlog.js';

const clampDays = (v) => Math.min(365, Math.max(1, parseInt(v || '7', 10) || 7));
const clampPage = (v) => Math.max(1, parseInt(v || '1', 10) || 1);
const clampPer  = (v) => Math.min(100, Math.max(5, parseInt(v || '20', 10) || 20));

function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ ok: false, error: 'ADMIN_NOT_CONFIGURED' }, 500);
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_BOUND' }, 500);
  let b = {};
  try { b = await request.json(); } catch { return json({ ok: false, error: 'BAD_JSON' }, 400); }
  if (String(b.password || '') !== env.ADMIN_PASSWORD) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);

  await ensureSchema(env);
  const op = String(b.op || 'summary');
  const days = clampDays(b.days);
  const win = `datetime('now','+9 hours','-${days} days')`;

  /* ── 요약 ── */
  if (op === 'summary') {
    const s = await env.DB.prepare(
      `SELECT COUNT(*) AS visits,
              SUM(CASE WHEN is_ad = 1 THEN 1 ELSE 0 END) AS ad,
              SUM(CASE WHEN is_ad = 0 THEN 1 ELSE 0 END) AS nonad,
              SUM(CASE WHEN is_ad = 1 THEN total_ms ELSE 0 END) AS ad_ms,
              SUM(CASE WHEN is_ad = 1 AND total_ms < 3000 THEN 1 ELSE 0 END) AS bounce,
              SUM(CASE WHEN verdict = 'block' THEN 1 ELSE 0 END) AS blocked,
              SUM(CASE WHEN verdict = 'warn' THEN 1 ELSE 0 END) AS warned,
              SUM(CASE WHEN verdict = 'watch' THEN 1 ELSE 0 END) AS watched,
              ROUND(AVG(pages), 1) AS avg_pages,
              COUNT(DISTINCT ip) AS ips, COUNT(DISTINCT fp) AS devices
         FROM visits WHERE started_at >= ${win}`).first();
    const s2 = await env.DB.prepare(
      `SELECT COUNT(*) AS pv, SUM(CASE WHEN reason = '내부 이동' THEN 1 ELSE 0 END) AS internal
         FROM click_logs WHERE created_at >= ${win} AND action <> 'test'`).first();
    const bl = await env.DB.prepare('SELECT COUNT(*) AS c FROM blocked_ips WHERE mode = \'block\'').first();
    return json({ ok: true, days, myIp: clientIP(request), stat: s || {}, pv: s2 || {}, blockedNow: (bl || {}).c || 0 });
  }

  /* ── 방문 목록 (세션) ── */
  if (op === 'visits') {
    const page = clampPage(b.page), per = clampPer(b.per);
    const src = String(b.src || 'all'), verdict = String(b.verdict || 'all'), q = String(b.q || '').trim();
    let where = `WHERE started_at >= ${win}`;
    const binds = [];
    if (src === 'ad') where += ' AND is_ad = 1';
    if (src === 'nonad') where += ' AND is_ad = 0';
    if (verdict !== 'all') { where += ' AND verdict = ?'; binds.push(verdict); }
    if (q) { where += ' AND (ip LIKE ? OR fp LIKE ? OR org LIKE ? OR kw LIKE ?)'; binds.push('%' + q + '%', '%' + q + '%', '%' + q + '%', '%' + q + '%'); }
    const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM visits ' + where).bind(...binds).first('c');
    const rows = await env.DB.prepare(
      'SELECT * FROM visits ' + where + ' ORDER BY started_at DESC LIMIT ? OFFSET ?'
    ).bind(...binds, per, (page - 1) * per).all();
    return json({ ok: true, page, per, total: total || 0, pages: Math.max(1, Math.ceil((total || 0) / per)), list: rows.results || [] });
  }

  /* ── 한 세션의 페이지 타임라인 ── */
  if (op === 'detail') {
    const sid = String(b.sid || '');
    const v = await env.DB.prepare('SELECT * FROM visits WHERE sid = ?').bind(sid).first();
    const l = await env.DB.prepare(
      `SELECT id, path, ref, keyword, created_at, dwell, act_ms, moved, reason
         FROM click_logs WHERE sid = ? ORDER BY id ASC LIMIT 60`).bind(sid).all();
    return json({ ok: true, visit: v || null, logs: l.results || [] });
  }

  /* ── 의심 IP: 광고 유입 또는 고위험 점수만 (직접방문 다수는 제외) ── */
  if (op === 'suspicious') {
    const page = clampPage(b.page), per = clampPer(b.per);
    const base = `FROM visits WHERE started_at >= ${win} AND (is_ad = 1 OR score >= 60)`;
    const total = await env.DB.prepare('SELECT COUNT(DISTINCT ip) AS c ' + base).first('c');
    const rows = await env.DB.prepare(
      `SELECT ip, COUNT(*) AS sessions, SUM(is_ad) AS ad_sessions, MAX(score) AS top,
              COUNT(DISTINCT fp) AS devices, SUM(total_ms) AS ms, MAX(region) AS region,
              MAX(org) AS org, MAX(last_at) AS last, MAX(reasons) AS reason
         ${base}
        GROUP BY ip
        HAVING SUM(is_ad) >= 1 OR MAX(score) >= 60
        ORDER BY top DESC, sessions DESC LIMIT ? OFFSET ?`
    ).bind(per, (page - 1) * per).all();
    return json({ ok: true, page, per, total: total || 0, pages: Math.max(1, Math.ceil((total || 0) / per)), list: rows.results || [] });
  }

  /* ── IP 대역(ASN) 반복 — 여러 IP로 나눠 들어와도 같은 회선이면 잡힌다 ── */
  if (op === 'asn') {
    const rows = await env.DB.prepare(
      `SELECT asn, MAX(org) AS org, COUNT(*) AS sessions, SUM(is_ad) AS ad_sessions,
              COUNT(DISTINCT ip) AS ips, COUNT(DISTINCT fp) AS devices,
              MAX(score) AS top, SUM(total_ms) AS ms, MAX(region) AS region, MAX(last_at) AS last
         FROM visits
        WHERE started_at >= ${win} AND asn IS NOT NULL AND asn <> ''
          AND (is_ad = 1 OR score >= 60)
        GROUP BY asn
        HAVING SUM(is_ad) >= 2 AND COUNT(DISTINCT ip) >= 2
        ORDER BY ad_sessions DESC, top DESC LIMIT 30`).all();
    return json({ ok: true, list: rows.results || [] });
  }

  /* ── 차단 목록 ── */
  if (op === 'blocked') {
    const rows = await env.DB.prepare('SELECT * FROM blocked_ips ORDER BY created_at DESC LIMIT 300').all();
    return json({ ok: true, list: rows.results || [] });
  }

  /* ── 원본 페이지뷰 (페이지네이션) ── */
  if (op === 'logs') {
    const page = clampPage(b.page), per = clampPer(b.per, 30);
    const total = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM click_logs WHERE created_at >= ${win} AND action <> 'test'`).first('c');
    const rows = await env.DB.prepare(
      `SELECT id, ip, fp, sid, path, ref, keyword, is_naver, score, action, reason, region,
              dwell, act_ms, created_at
         FROM click_logs WHERE created_at >= ${win} AND action <> 'test'
        ORDER BY id DESC LIMIT ? OFFSET ?`).bind(per, (page - 1) * per).all();
    return json({ ok: true, page, per, total: total || 0, pages: Math.max(1, Math.ceil((total || 0) / per)), list: rows.results || [] });
  }

  /* ── 기존 데이터 재집계 (배치) ── */
  if (op === 'reindex') {
    let from = String(b.from || '').trim();
    if (!from) {
      const mn = await env.DB.prepare("SELECT MIN(created_at) AS m FROM click_logs WHERE action <> 'test'").first('m');
      if (!mn) return json({ ok: true, done: true, inserted: 0, msg: '기록이 없습니다.' });
      from = mn;
    }
    const toRow = await env.DB.prepare("SELECT datetime(?, '+10 days') AS t").bind(from).first();
    const to = toRow.t;
    const rows = await env.DB.prepare(
      `WITH base AS (
         SELECT id, ip, COALESCE(NULLIF(fp,''), 'ip:' || ip) AS k, is_naver, created_at,
                COALESCE(dwell, 0) AS dwell, COALESCE(moved, 0) AS moved, asn, region, org, country, ua, keyword,
                julianday(created_at) AS jd
           FROM click_logs
          WHERE action <> 'test' AND created_at >= ? AND created_at < ?
       ),
       g AS (SELECT *, CASE WHEN jd - LAG(jd) OVER (PARTITION BY k ORDER BY created_at) > 0.0208333 THEN 1 ELSE 0 END AS ns FROM base),
       s AS (SELECT *, SUM(COALESCE(ns, 1)) OVER (PARTITION BY k ORDER BY created_at ROWS UNBOUNDED PRECEDING) AS seg FROM g)
       SELECT k, seg, MIN(id) AS first_id, MAX(id) AS last_id, MAX(ip) AS ip, MAX(is_naver) AS is_ad,
              COUNT(*) AS pages, SUM(dwell) AS sec, MAX(moved) AS moved,
              MIN(created_at) AS started_at, MAX(created_at) AS last_at,
              MAX(asn) AS asn, MAX(region) AS region, MAX(org) AS org, MAX(country) AS country, MAX(ua) AS ua, MAX(keyword) AS kw
         FROM s GROUP BY k, seg ORDER BY MIN(created_at) ASC`
    ).bind(from, to).all();

    const list = rows.results || [];
    const BOT = /(bot|crawl|spider|headless|phantom|selenium|puppeteer|playwright|curl|wget|python-requests|okhttp|scrapy|httpclient|java\/)/i;
    // 30분 창 반복성 계산 (ip / fp)
    const byIp = new Map(), byFp = new Map(), byAsn = new Map();
    list.forEach((r, i) => {
      (byIp.get(r.ip) || byIp.set(r.ip, []).get(r.ip)).push(i);
      if (r.k) (byFp.get(r.k) || byFp.set(r.k, []).get(r.k)).push(i);
      if (r.asn) (byAsn.get(r.asn) || byAsn.set(r.asn, []).get(r.asn)).push(i);
    });
    const countWin = (arr, i, min) => {
      const t = new Date(list[i].started_at.replace(' ', 'T') + '+09:00').getTime();
      let n = 0;
      for (const j of arr) {
        const u = new Date(list[j].started_at.replace(' ', 'T') + '+09:00').getTime();
        if (Math.abs(u - t) <= min * 60000 && list[j].is_ad) n++;
      }
      return n;
    };
    const stmts = [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const isAd = !!r.is_ad;
      const sec = Number(r.sec) || 0;
      const pages = Number(r.pages) || 1;
      let score = 0;
      if (isAd) {
        const ipAd = countWin(byIp.get(r.ip) || [], i, 30);
        const fpAd = r.k ? countWin(byFp.get(r.k) || [], i, 30) : 0;
        const ipSet = new Set(); (byFp.get(r.k) || []).forEach(j => { if (list[j].is_ad) ipSet.add(list[j].ip); });
        const fpIps = ipSet.size;
        const host = /(google|amazon|aws|digitalocean|vultr|ovh|hetzner|microsoft|azure|oracle|alibaba|tencent|contabo|linode|m247|leaseweb|colocrossing|hostinger|namecheap|proxy|vpn)/i.test(r.org || '');
        if (ipAd >= 10) score += 100; else if (ipAd >= 6) score += 75; else if (ipAd >= 4) score += 55; else if (ipAd >= 3) score += 35;
        if (fpAd >= 8) score += 110; else if (fpAd >= 5) score += 80; else if (fpAd >= 4) score += 55; else if (fpAd >= 3) score += 35;
        if (fpIps >= 3) score += 80; else if (fpIps >= 2) score += 45;
        const carrier = /(skt|kt |lgu|lg u\+|korea telecom|sk broadband|sk telink|hello)/i.test(r.org || '');
        if (r.asn && !carrier) {
          const asnAd = countWin(byAsn.get(r.asn) || [], i, 30);
          if (asnAd >= 8) score += 65; else if (asnAd >= 5) score += 45; else if (asnAd >= 3) score += 25;
        }
        if (BOT.test(r.ua || '')) score += 60;
        if (host) score += 50;
      }
      // 체류·페이지·활동은 점수에 반영하지 않는다 (표시용)
      score = Math.max(0, Math.round(score));
      let verdict = 'normal';
      if (score >= 105) verdict = 'block'; else if (score >= 75) verdict = 'warn'; else if (score >= 55) verdict = 'watch';
      const sid = ('b' + r.k + ':' + r.seg + ':' + r.started_at).slice(0, 48);
      stmts.push(env.DB.prepare(
        `INSERT OR REPLACE INTO visits (sid, fp, ip, src, is_ad, started_at, last_at, total_ms, pages, moved, depth, asn, region, org, country, ua, kw, score, verdict, reasons)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(sid, r.k && !String(r.k).startsWith('ip:') ? r.k : '', r.ip, isAd ? 'naver' : '', isAd ? 1 : 0,
             r.started_at, r.last_at, sec * 1000, pages, r.moved || 0, pages, String(r.asn || ''),
             r.region || '', r.org || '', r.country || '', String(r.ua || '').slice(0, 200), String(r.kw || ''), score, verdict,
             isAd ? '재집계' : ''));
    }
    await env.DB.prepare('DELETE FROM visits WHERE started_at >= ? AND started_at < ?').bind(from, to).run();
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    const done = !list.length || to > new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    return json({ ok: true, done, from, to, inserted: list.length, next: done ? null : to });
  }

  /* ── CSV (네이버 제출용) ── */
  if (op === 'export') {
    const rows = await env.DB.prepare(
      `SELECT started_at, ip, fp, total_ms, pages, score, verdict, reasons
         FROM visits WHERE started_at >= ${win} AND (is_ad = 1 OR score >= 60)
        ORDER BY started_at DESC LIMIT 3000`).all();
    const head = ['일시', 'IP', '기기지문', '총체류(초)', '페이지', '점수', '판정', '사유'];
    const lines = [head.map(csvCell).join(',')];
    (rows.results || []).forEach(r => lines.push([
      r.started_at, r.ip, r.fp || '', Math.round((r.total_ms || 0) / 1000), r.pages,
      r.score, r.verdict, r.reasons || ''
    ].map(csvCell).join(',')));
    return json({ ok: true, csv: lines.join('\r\n'), count: (rows.results || []).length });
  }

  /* ── 차단/허용/해제/초기화 ── */
  if (op === 'block' || op === 'allow' || op === 'unblock') {
    const ip = String(b.ip || '').trim();
    if (!ip) return json({ ok: false, error: 'BAD_IP' }, 400);
    if (op === 'unblock') {
      await env.DB.prepare('DELETE FROM blocked_ips WHERE ip = ? AND manual = 1').bind(ip).run();
      return json({ ok: true });
    }
    const mode = op;
    const hours = Math.max(0, parseInt(b.hours || '24', 10) || 0);
    const until = mode === 'allow' || !hours ? null
      : new Date(Date.now() + 9 * 3600000 + hours * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    await env.DB.prepare(
      `INSERT INTO blocked_ips (ip, mode, reason, score, hit_count, blocked_until, manual)
       VALUES (?, ?, ?, 0, 0, ?, 1)
       ON CONFLICT(ip) DO UPDATE SET mode = excluded.mode, reason = excluded.reason,
         blocked_until = excluded.blocked_until, manual = 1`
    ).bind(ip, mode, mode === 'block' ? '관리자 수동 차단' : '관리자 허용', until).run();
    return json({ ok: true });
  }

  if (op === 'reset') {
    await env.DB.prepare('DELETE FROM click_logs').run();
    await env.DB.prepare('DELETE FROM visits').run();
    await env.DB.prepare('DELETE FROM blocked_ips WHERE manual = 0').run();
    return json({ ok: true });
  }

  return json({ ok: false, error: 'UNKNOWN_OP' }, 400);
}
