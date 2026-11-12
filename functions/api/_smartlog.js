
// 부정클릭방지 — 광고 유입 전용 정밀 판정
// 원칙: 광고를 경유하지 않은 방문은 절대 경고/차단하지 않는다.

export const RETENTION_DAYS = 365;
export const WINDOW_MIN = 30;

// 3단계 임계 (광고 유입만 적용)
export const STAGE = { watch: 55, warn: 75, block: 105 };

const HOSTING = [
  'google','amazon','aws','digitalocean','vultr','ovh','hetzner','microsoft','azure',
  'oracle','alibaba','aliyun','tencent','contabo','linode','m247','leaseweb','colocrossing',
  'datacamp','zenlayer','kaopu','choopa','godaddy','hostwinds','ionos','scaleway','upcloud',
  'packethub','kamatera','hostinger','namecheap','sakura','gmo','idc','fastly','akamai',
  'mullvad','nordvpn','expressvpn','surfshark','cyberghost','private internet','proxy','vpn'
];

const CARRIER = ['skt','kt','lgu','lg u+','samsung','korea telecom','sk broadband','hello','sk telink'];

const BOT_UA = /(bot|crawl|spider|headless|phantom|selenium|puppeteer|playwright|curl|wget|python-requests|okhttp|scrapy|httpclient|java\/)/i;

/**
 * 유입 판별
 * 네이버 자동 추적 URL 파라미터(n_media, n_query, n_rank, n_ad, n_keyword ...)가
 * 실제로 붙어 있어야 '광고 클릭'으로 인정한다.
 * 레퍼러만 search.naver.com 인 경우는 자연검색(organic)이므로 채점하지 않는다.
 */
export const NAVER_AD_PARAMS = ['n_media','n_query','n_rank','n_ad','n_ad_group','n_keyword','n_keyword_id','n_match','n_campaign_type','n_ad_group_type'];

export function detectSource(ref, kw, qs) {
  let host = '';
  try { host = new URL(ref).hostname.toLowerCase(); } catch {}
  const q = String(qs || '');
  const hasNaverAd = NAVER_AD_PARAMS.some(k => new RegExp('[?&]' + k + '=').test(q));

  if (hasNaverAd) return 'naver';
  if (/[?&]gclid=|gbraid=|wbraid=/.test(q)) return 'google';
  if (/[?&]utm_source=naver/i.test(q)) return 'naver';

  if (host.includes('search.naver') || host === 'naver.com' || host.endsWith('.naver.com')) return 'organic-naver';
  if (host.includes('google')) return 'organic-google';
  if (host.includes('daum') || host.includes('kakao')) return 'organic-daum';
  return '';
}

export function srcLabel(src) {
  if (src === 'naver' || src === 'google') return '광고';
  if (String(src || '').startsWith('organic')) return '자연검색';
  if (!src) return '직접방문';
  return '직접방문';
}

export function clientIP(request) {
  const h = request.headers;
  return h.get('cf-connecting-ip') || (h.get('x-forwarded-for') || '').split(',')[0].trim() || '0.0.0.0';
}

export async function uaHash(ua) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ua || ''));
  return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function isHosting(org) {
  const o = String(org || '').toLowerCase();
  return HOSTING.some(k => o.includes(k));
}

export function isCarrier(org) {
  const o = String(org || '').toLowerCase();
  return CARRIER.some(k => o.includes(k));
}

export async function blockState(env, ip) {
  const r = await env.DB.prepare('SELECT * FROM blocked_ips WHERE ip = ?').bind(ip).first();
  if (!r) return { mode: 'none' };
  if (r.mode === 'allow') return { mode: 'allow', row: r };
  if (r.blocked_until) {
    const t = new Date(r.blocked_until.replace(' ', 'T') + '+09:00').getTime();
    if (t && t < Date.now()) return { mode: 'expired', row: r };
  }
  return { mode: 'block', row: r };
}

export async function maybePurge(env) {
  if (Math.random() > 0.03) return;
  try {
    await env.DB.prepare(`DELETE FROM click_logs WHERE created_at < datetime('now','+9 hours','-${RETENTION_DAYS} days')`).run();
    await env.DB.prepare(`DELETE FROM blocked_ips WHERE manual = 0 AND blocked_until IS NOT NULL AND blocked_until < datetime('now','+9 hours')`).run();
  } catch (e) {}
}

/**
 * 채점
 * - ad=false(직접/검색엔진/내부이동) → 항상 allow. 기록만 남긴다.
 * - ad=true(광고 경유) → 아래 신호로 채점.
 */
export function evaluate(c) {
  const why = [];

  // ── 광고 유입이 아니면 무조건 통과 (기록만)
  if (!c.isAd) {
    // 단, 명백한 봇 + 호스팅 대역이면 로그에만 'suspicious' 표시
    const bad = (BOT_UA.test(c.ua || '') && isHosting(c.org)) ? 1 : 0;
    return { score: bad ? 60 : 0, reasons: bad ? ['봇+호스팅'] : [], action: 'allow', stage: 0 };
  }

  let s = 0;

  // 1) 같은 IP가 광고로 반복 클릭
  if (c.ipHits >= 10) { s += 100; why.push(`동일 IP ${c.ipHits}회 광고 클릭`); }
  else if (c.ipHits >= 6) { s += 75; why.push(`동일 IP ${c.ipHits}회 광고 클릭`); }
  else if (c.ipHits >= 4) { s += 55; why.push(`동일 IP ${c.ipHits}회 광고 클릭`); }
  else if (c.ipHits >= 3) { s += 35; why.push(`동일 IP ${c.ipHits}회 광고 클릭`); }

  // 2) 같은 기기가 광고로 반복 클릭 (쿠키 삭제 우회 대응)
  if (c.fpHits >= 8) { s += 110; why.push(`동일 기기 ${c.fpHits}회`); }
  else if (c.fpHits >= 5) { s += 80; why.push(`동일 기기 ${c.fpHits}회`); }
  else if (c.fpHits >= 4) { s += 55; why.push(`동일 기기 ${c.fpHits}회`); }
  else if (c.fpHits >= 3) { s += 35; why.push(`동일 기기 ${c.fpHits}회`); }

  // 3) IP 변경 (같은 기기, 다른 IP) — 악성 부정클릭 핵심 패턴
  if (c.fpIps >= 3) { s += 80; why.push(`IP 변경 ${c.fpIps}회`); }
  else if (c.fpIps >= 2) { s += 45; why.push(`IP 변경 ${c.fpIps}회`); }

  // 4) 자동화 / 호스팅
  if (BOT_UA.test(c.ua || '')) { s += 60; why.push('자동화 프로그램'); }
  if (isHosting(c.org)) { s += 50; why.push('호스팅/VPN 대역'); }
  else if (isCarrier(c.org)) { s -= 25; why.push('국내 통신사(감점)'); }

  // 5) 비정상 활동 (광고 클릭인데 사람 활동이 없음)
  if (c.dwell !== null && c.dwell < 2) { s += 20; why.push('즉시 이탈'); }
  if (c.moved === 0) { s += 15; why.push('사람 활동 없음'); }
  if (c.depth === 1 && c.ipHits >= 3) { s += 10; why.push('단일 페이지만 열람'); }
  if (c.isKnown === 0 && c.ipHits >= 3) { s += 15; why.push('쿠키 삭제 후 재유입'); }

  s = Math.max(0, s);
  let action = 'allow', stage = 0;
  if (s >= STAGE.block) { action = 'block'; stage = 3; }
  else if (s >= STAGE.warn) { action = 'warn'; stage = 2; }
  else if (s >= STAGE.watch) { action = 'warn'; stage = 1; }

  return { score: s, reasons: why, action, stage };
}


/* ═══════════════════════════════════════════════════════════
   세션(방문) 단위 판정 — v2
   축 1) 위험도: 반복성 (같은 IP/기기의 광고 세션 반복)
   축 2) 품질  : 머묾 (총 체류·페이지 수·활동)
   품질이 좋으면 위험도를 깎아 '정상'으로 되돌린다.
   ═══════════════════════════════════════════════════════════ */
export const VERDICT_LABEL = { normal: '정상', watch: '주의', warn: '의심', block: '차단' };

export function judgeSession(c) {
  const why = [];
  let s = 0;

  // ── 위험도: 반복성 (광고 세션만 센다)
  if (c.isAd) {
    if (c.ipAd >= 10) { s += 100; why.push(`같은 IP 광고 ${c.ipAd}회`); }
    else if (c.ipAd >= 6) { s += 75; why.push(`같은 IP 광고 ${c.ipAd}회`); }
    else if (c.ipAd >= 4) { s += 55; why.push(`같은 IP 광고 ${c.ipAd}회`); }
    else if (c.ipAd >= 3) { s += 35; why.push(`같은 IP 광고 ${c.ipAd}회`); }

    if (c.fpAd >= 8) { s += 110; why.push(`같은 기기 광고 ${c.fpAd}회`); }
    else if (c.fpAd >= 5) { s += 80; why.push(`같은 기기 광고 ${c.fpAd}회`); }
    else if (c.fpAd >= 4) { s += 55; why.push(`같은 기기 광고 ${c.fpAd}회`); }
    else if (c.fpAd >= 3) { s += 35; why.push(`같은 기기 광고 ${c.fpAd}회`); }

    if (c.fpIps >= 3) { s += 80; why.push(`기기당 IP ${c.fpIps}개`); }
    else if (c.fpIps >= 2) { s += 45; why.push(`기기당 IP ${c.fpIps}개`); }
  }

  // ── IP 대역(ASN) 반복 — 경쟁사가 여러 IP를 돌려 써도 같은 회선이면 한 대역으로 묶인다
  //    단, 통신사(ISP) 대역은 수백만 명이 공유하므로 채점에서 제외한다 (오탐 방지)
  if (c.isAd && c.asnAd >= 3 && !c.carrier) {
    if (c.asnAd >= 8) { s += 65; why.push(`같은 대역 광고 ${c.asnAd}회`); }
    else if (c.asnAd >= 5) { s += 45; why.push(`같은 대역 광고 ${c.asnAd}회`); }
    else { s += 25; why.push(`같은 대역 광고 ${c.asnAd}회`); }
  }

  // ── 환경
  if (c.bot) { s += 60; why.push('자동화 프로그램'); }
  if (c.hosting) { s += 50; why.push('호스팅/VPN 대역'); }
  else if (c.carrier) { s -= 25; why.push('국내 통신사(감점)'); }

  // ── 체류시간·페이지 수·활동량은 '표시용 지표'일 뿐, 점수에 반영하지 않는다.
  //    (경쟁사가 오래 머무는 것만으로 감점되면 실제 고객과 구분이 안 되므로 제외)

  s = Math.max(0, Math.round(s));

  let verdict = 'normal';
  if (s >= STAGE.block) verdict = 'block';
  else if (s >= STAGE.warn) verdict = 'warn';
  else if (s >= STAGE.watch) verdict = 'watch';

  // 상담을 완료한 방문은 실제 고객이므로 차단하지 않는다
  if (c.converted) { verdict = 'normal'; s = Math.min(s, 40); }

  return { score: s, verdict, reasons: why };
}

/* 스키마 보장 — 세션 컬럼/테이블이 없으면 만든다 (1회) */
let _schemaReady = false;
export async function ensureSchema(env) {
  if (_schemaReady || !env || !env.DB) return;
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS visits (
      sid TEXT PRIMARY KEY, fp TEXT, ip TEXT, src TEXT, is_ad INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL, last_at TEXT, total_ms INTEGER NOT NULL DEFAULT 0,
      pages INTEGER NOT NULL DEFAULT 1, moved INTEGER NOT NULL DEFAULT 0,
      depth INTEGER NOT NULL DEFAULT 1, asn TEXT, region TEXT, org TEXT, country TEXT, ua TEXT,
      score INTEGER NOT NULL DEFAULT 0, verdict TEXT NOT NULL DEFAULT 'normal', reasons TEXT)`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_visits_time ON visits (started_at DESC)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_visits_ip ON visits (ip, started_at DESC)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_visits_fp ON visits (fp, started_at DESC)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_visits_ad ON visits (is_ad, started_at DESC)').run();
    try { await env.DB.prepare('ALTER TABLE click_logs ADD COLUMN sid TEXT').run(); } catch (e) {}
    try { await env.DB.prepare('ALTER TABLE click_logs ADD COLUMN act_ms INTEGER').run(); } catch (e) {}
    try { await env.DB.prepare('ALTER TABLE visits ADD COLUMN asn TEXT').run(); } catch (e) {}
    _schemaReady = true;
  } catch (e) {}
}
