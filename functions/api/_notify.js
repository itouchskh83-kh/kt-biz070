// 상담신청 접수 시 알림 발송
// 우선순위: Cloudflare 환경변수 > 아래 기본값
const DEFAULT_TG_TOKEN = '9103165370:AAE8r9tL02GfiFRpo4zjn5cyLfhVZokd-I8';
const DEFAULT_TG_CHAT  = '-5441001983';

function won(n) { return String(n || '').replace(/\D/g, ''); }
function phone(d) {
  const s = won(d);
  if (s.length === 11) return s.slice(0,3)+'-'+s.slice(3,7)+'-'+s.slice(7);
  if (s.length === 10) return s.slice(0,3)+'-'+s.slice(3,6)+'-'+s.slice(6);
  return s;
}
function now() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const z = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '.' + z(d.getUTCMonth()+1) + '.' + z(d.getUTCDate()) +
         ' ' + z(d.getUTCHours()) + ':' + z(d.getUTCMinutes());
}

export function buildMessage(post) {
  const kind = post.kind === 'inquiry' ? '1:1문의' : '상담신청';
  const lines = [
    '🔔 새 ' + kind + '이 접수되었습니다',
    '',
    '▪ 상품 : ' + (post.product || '기타 문의'),
    '▪ 이름 : ' + post.author,
    '▪ 연락처 : ' + phone(post.phone),
    '▪ 제목 : ' + post.title,
    '',
    String(post.content || '').slice(0, 300),
    '',
    '🕐 ' + now()
  ];
  return lines.join('\n');
}

export async function notify(env, post) {
  const token = env.TELEGRAM_BOT_TOKEN || DEFAULT_TG_TOKEN;
  const chat  = env.TELEGRAM_CHAT_ID || DEFAULT_TG_CHAT;
  const text  = buildMessage(post);

  const jobs = [];

  if (token && chat) {
    jobs.push(fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true })
    }).catch(() => null));
  }
  if (env.DISCORD_WEBHOOK) {
    jobs.push(fetch(env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text }) }).catch(() => null));
  }
  if (env.SLACK_WEBHOOK) {
    jobs.push(fetch(env.SLACK_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }) }).catch(() => null));
  }
  if (env.RESEND_API_KEY && env.NOTIFY_EMAIL) {
    jobs.push(fetch('https://api.resend.com/emails', { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.RESEND_API_KEY },
      body: JSON.stringify({ from: env.NOTIFY_FROM || 'onboarding@resend.dev', to: [env.NOTIFY_EMAIL],
        subject: '[상담신청] ' + post.title, text }) }).catch(() => null));
  }

  await Promise.allSettled(jobs);
}
