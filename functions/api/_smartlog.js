
// 부정클릭방지시스템 — 다중 신호 정밀 판정

export const RETENTION_DAYS = 365;
export const WINDOW_MIN = 30;

// 3단계 임계
export const STAGE = { watch: 40, warn: 65, block: 100 };

// 호스팅·VPN (광고 부정클릭 고위험 대역)
const HOSTING = [
  'google','amazon','aws','digitalocean','vultr','ovh','hetzner','microsoft','azure',
  'oracle','alibaba','aliyun','tencent','contabo','linode','m247','leaseweb','colocrossing',
  'datacamp','zenlayer','kaopu','choopa','godaddy','hostwinds','ionos','scaleway','upcloud',
  'packethub','kamatera','hostinger','namecheap','sakura','gmo','idc','fastly','akamai',
  'mullvad','nordvpn','expressvpn','surfshark','cyberghost','private internet','proxy','vpn'
];

// 모바일 통신사 (정상 방문자 판별에 사용)
const CARRIER = ['skt','kt','lgu','lg u+','samsung','korea telecom','sk broadband','hello'];

const BOT_UA = /(bot|crawl|spider|headless|phantom|selenium|puppeteer|playwright|curl|wget|python-requests|okhttp|scrapy|httpclient|java\/)/i;

export const REASON_TEXT = {
  ipRepeat: (n) => `동일 IP ${n}회 반복`,
  fpRepeat: (n) => `동일 기기 ${n}회 반복`,
  ipChange: (n) => `IP 변경 ${n}회 (기기 동일)`,
  bot: '자동화 프로그램',
  hosting: '호스팅/VPN 대역',
  noRef: '유입경로 없음',
  bounce: '즉시 이탈',
  noActivity: '사람 활동 없음',
  cookieWipe: '쿠키·저장소 삭제 후 재유입',
  adRepeat: '광고 경유 반복',
  noDepth: '단일 페이지만 열람'
};

export function clientIP(request) {
  const h = request.headers;
  return h.get('cf-connecting-ip') || (h.get('x-forwarded-for') || '').split(',')[0].trim() || '0.0.0.0';
}

export async function uaHash(ua) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ua || ''));
  return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function isNaverRef(ref) {
  try {
    const h = new URL(ref).hostname;
    return h === 'search.naver.com' || h === 'm.search.naver.com' || h.endsWith('.naver.com');
  } catch { return false; }
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

// 정밀 점수 계산
export function evaluate(c) {
  let s = 0;
  const why = [];

  // 1) IP 반복
  if (c.ipHits >= 10) { s += 110; why.push(REASON_TEXT.ipRepeat(c.ipHits)); }
  else if (c.ipHits >= 6) { s += 85; why.push(REASON_TEXT.ipRepeat(c.ipHits)); }
  else if (c.ipHits >= 4) { s += 60; why.push(REASON_TEXT.ipRepeat(c.ipHits)); }
  else if (c.ipHits >= 2) { s += 32; why.push(REASON_TEXT.ipRepeat(c.ipHits)); }

  // 2) 기기 지문 반복 (IP 바꿔도 잡힘 — 핵심)
  if (c.fpHits >= 8) { s += 120; why.push(REASON_TEXT.fpRepeat(c.fpHits)); }
  else if (c.fpHits >= 5) { s += 90; why.push(REASON_TEXT.fpRepeat(c.fpHits)); }
  else if (c.fpHits >= 3) { s += 60; why.push(REASON_TEXT.fpRepeat(c.fpHits)); }
  else if (c.fpHits >= 2) { s += 30; why.push(REASON_TEXT.fpRepeat(c.fpHits)); }

  // 3) IP 변경 검출 (같은 기기, 다른 IP) — 악성 부정클릭의 대표 패턴
  if (c.fpIps >= 3) { s += 90; why.push(REASON_TEXT.ipChange(c.fpIps)); }
  else if (c.fpIps >= 2) { s += 45; why.push(REASON_TEXT.ipChange(c.fpIps)); }

  // 4) 자동화
  if (BOT_UA.test(c.ua || '')) { s += 70; why.push(REASON_TEXT.bot); }

  // 5) 호스팅/VPN — 통신사면 감점 (정상 사용자 보호)
  if (isHosting(c.org)) { s += 65; why.push(REASON_TEXT.hosting); }
  else if (isCarrier(c.org)) { s -= 15; }

  // 6) 유입·활동
  if (!c.hasRef && c.ipHits >= 2) { s += 18; why.push(REASON_TEXT.noRef); }
  if (c.isNaver && c.ipHits >= 2) { s += 22; why.push(REASON_TEXT.adRepeat); }
  if (c.dwell !== null && c.dwell < 3 && c.ipHits >= 2) { s += 25; why.push(REASON_TEXT.bounce); }
  if (c.moved === 0 && c.ipHits >= 2) { s += 20; why.push(REASON_TEXT.noActivity); }
  if (c.depth === 1 && c.ipHits >= 3) { s += 15; why.push(REASON_TEXT.noDepth); }
  if (c.isKnown === 0) { s += 22; why.push(REASON_TEXT.cookieWipe); }

  return { score: Math.max(0, s), reasons: why };
}
