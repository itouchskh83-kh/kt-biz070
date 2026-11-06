
(function(){
  /* ADMIN_SKIP */ if (/\/admin(\.html)?$/i.test(location.pathname)) return;
  "use strict";
  var K = 'slf', K2 = 'sl_fp';

  /* ---------- 1. 기기 지문 (쿠키·저장소 삭제 대응) ---------- */
  function canvasFP(){
    try{
      var c = document.createElement('canvas'), x = c.getContext('2d');
      x.textBaseline = 'top'; x.font = '14px Arial';
      x.fillStyle = '#f60'; x.fillRect(0,0,100,30);
      x.fillStyle = '#069'; x.fillText('soony-#$%&', 2, 6);
      x.fillStyle = 'rgba(102,204,0,.7)'; x.fillText('soony-#$%&', 4, 12);
      return c.toDataURL().slice(-96);
    }catch(e){ return ''; }
  }
  function hash(s){
    var h = 5381, i = s.length;
    while(i) h = (h*33) ^ s.charCodeAt(--i);
    return (h>>>0).toString(36) + s.length.toString(36);
  }
  function fingerprint(){
    var p = [
      navigator.userAgent, navigator.language, navigator.platform,
      screen.width + 'x' + screen.height, screen.colorDepth,
      (new Date()).getTimezoneOffset(),
      navigator.hardwareConcurrency || 0, navigator.deviceMemory || 0,
      navigator.maxTouchPoints || 0, canvasFP()
    ].join('|');
    return hash(p);
  }

  var fp = fingerprint();
  // 3중 저장 — 하나 지워도 나머지로 복원
  try{ localStorage.setItem(K, fp); }catch(e){}
  try{ sessionStorage.setItem(K2, fp); }catch(e){}
  try{ document.cookie = K + '=' + fp + ';path=/;max-age=31536000;SameSite=Lax'; }catch(e){}
  function recall(){
    try{ if(localStorage.getItem(K)) return localStorage.getItem(K); }catch(e){}
    try{ if(sessionStorage.getItem(K2)) return sessionStorage.getItem(K2); }catch(e){}
    var m = document.cookie.match(new RegExp('(?:^|; )' + K + '=([^;]*)'));
    return m ? m[1] : '';
  }
  var known = recall();

  /* ---------- 2. 활동 분석 ---------- */
  var t0 = Date.now(), depth = 1, moved = false, scrolled = 0;
  try{
    var seen = sessionStorage.getItem('sl_pv');
    depth = seen ? (+seen + 1) : 1;
    sessionStorage.setItem('sl_pv', String(depth));
  }catch(e){}
  window.addEventListener('scroll', function(){ scrolled += 1; if(scrolled > 3) moved = true; }, {passive:true});
  window.addEventListener('mousemove', function(){ moved = true; }, {once:true, passive:true});
  window.addEventListener('touchstart', function(){ moved = true; }, {once:true, passive:true});

  /* ---------- 3. 단말·통신사 표시 (경고 2단계+) ---------- */
  function deviceName(){
    var ua = navigator.userAgent;
    var m = ua.match(/(SM-[A-Z0-9]+|iPhone\d*|Pixel \d+|Galaxy [A-Za-z0-9]+)/);
    if(m) return m[1];
    if(/iPhone/.test(ua)) return 'iPhone';
    if(/iPad/.test(ua)) return 'iPad';
    if(/Android/.test(ua)) return 'Android';
    if(/Macintosh/.test(ua)) return 'Mac';
    if(/Windows/.test(ua)) return 'Windows PC';
    return 'PC';
  }

  /* ---------- 4. 배지 ---------- */
  var badge = document.getElementById('slBadge');
  function setState(state, hits){
    if(!badge) return;
    badge.classList.remove('is-detect','is-block');
    var n = badge.querySelector('.sl-n');
    if(state === 'warn'){ badge.classList.add('is-detect'); }
    if(state === 'block'){ badge.classList.add('is-block'); }
    if(n){ n.textContent = hits > 1 ? String(hits) : ''; n.style.display = hits > 1 ? '' : 'none'; }
  }

  /* ---------- 5. 3단계 경고 (즐겨찾기 → 중복안내 → 법적경고) ---------- */
  var LEGAL = '<p class="sl-legal">본 접속 기록은 서버에 저장되었으며, 광고비 부정 집행에 대한 <b>민·형사상 법적 조치</b>의 증거자료로 사용될 수 있습니다.</p>';

  function overlay(stage, data){
    if(document.getElementById('slOv')) return;
    var box = document.createElement('div');
    box.id = 'slOv';
    box.className = 'sl-ov';
    var dev = '<p class="sl-dev">접속 기기 <b>' + deviceName() + '</b>'
            + (data.region ? ' · 지역 <b>' + data.region + '</b>' : '')
            + (data.org ? ' · 통신 <b>' + data.org + '</b>' : '') + '</p>';
    var h = '';

    if(stage >= 3){
      box.className += ' sl-ov--block';
      h = '<div class="sl-card">'
        + '<div class="sl-ic danger">!</div>'
        + '<h3>부정클릭으로 판단되어 접속이 차단되었습니다</h3>'
        + '<p class="sl-p">동일 기기에서 반복적으로 광고를 경유한 접속이 확인되었습니다.<br>'
        + '해당 접속 기록과 IP는 서버에 보관되며, 광고비 환수 및 법적 조치의 근거로 사용됩니다.</p>'
        + dev + LEGAL
        + '<a class="sl-btn" href="tel:1644-9637">1644-9637 상담 후 해제</a>'
        + '<p class="sl-small">정상 방문이 차단되었다면 위 번호로 연락 주시면 즉시 해제해 드립니다.</p></div>';
    } else if(stage === 2){
      h = '<div class="sl-card">'
        + '<div class="sl-ic danger">!</div>'
        + '<h3>동일 기기에서 반복 접속이 확인되었습니다</h3>'
        + '<p class="sl-p">같은 기기로 광고를 통해 여러 번 방문하셨습니다.<br>'
        + '반복 접속이 계속되면 <b>접속이 자동으로 제한</b>됩니다.</p>'
        + dev + LEGAL
        + '<button type="button" class="sl-btn ghost" id="slClose">확인했습니다</button></div>';
    } else {
      h = '<div class="sl-card">'
        + '<div class="sl-ic warn">i</div>'
        + '<h3>즐겨찾기를 추가해 주세요</h3>'
        + '<p class="sl-p">같은 기기에서 짧은 시간에 여러 번 방문하셨습니다.<br>'
        + '즐겨찾기에 추가하시면 광고를 거치지 않고 바로 접속할 수 있습니다.</p>'
        + '<p class="sl-tip">' + (/Mac|iPhone|iPad/.test(navigator.platform + navigator.userAgent) ? '⌘ + D' : 'Ctrl + D') + ' 를 눌러 즐겨찾기 추가</p>'
        + '<button type="button" class="sl-btn" id="slClose">확인했습니다</button></div>';
    }
    box.innerHTML = h;
    document.body.appendChild(box);
    if(stage >= 3) document.documentElement.style.overflow = 'hidden';
    var c = document.getElementById('slClose');
    if(c) c.addEventListener('click', function(){
      box.classList.add('is-out');
      setTimeout(function(){ box.remove(); }, 220);
    });
  }

  /* ---------- 6. 전송 ---------- */
  var path = location.pathname || '/';
  if(/\/(admin|_)/.test(path)) return;
  var TEST = /[?&]sl_test=1/.test(location.search) ? 1 : 0;
  var ref = document.referrer || '', kw = '';
  try{
    var sp = new URLSearchParams(location.search);
    kw = sp.get('n_query') || sp.get('query') || sp.get('q') || sp.get('keyword') || '';
  }catch(e){}

  function send(beacon){
    var body = JSON.stringify({
      p: path, r: ref, q: kw, qs: location.search.slice(0,300), f: fp, n: known && known !== fp ? 0 : 1,
      d: Math.round((Date.now() - t0) / 1000), v: depth,
      m: moved ? 1 : 0, s: scrolled, w: screen.width, h: screen.height, t: TEST
    });
    if(beacon && navigator.sendBeacon){
      try{ navigator.sendBeacon('/api/track', new Blob([body], {type:'application/json'})); return; }catch(e){}
    }
    fetch('/api/track', { method:'POST', headers:{'content-type':'application/json'},
      body: body, keepalive:true, credentials:'same-origin' })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(!d || !d.ok) return;
        if(d.action === 'block'){ setState('block', d.hits); overlay(3, d); }
        else if(d.action === 'warn'){ setState('warn', d.hits); overlay(d.stage || 1, d); }
      }).catch(function(){});
  }

  function boot(){
    // 체류시간 확보 후 전송 (이탈률 판정용)
    setTimeout(function(){ send(false); }, 1200);
  }
  if(document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);

  window.addEventListener('pagehide', function(){ send(true); });
})();
