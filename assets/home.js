(function(){
  "use strict";
  document.addEventListener('DOMContentLoaded', function(){

    /* ---------------- 히어로 슬라이더 ---------------- */
    var track = document.querySelector('.hero-track');
    if (track) {
      var slides = Array.prototype.slice.call(track.querySelectorAll('.hero-slide'));
      var curNum = document.getElementById('curNum');
      var idx = Math.max(0, slides.findIndex(function(s){ return s.classList.contains('is-active'); }));
      var timer = null, playing = true, DELAY = 5500;
      function show(n){
        if (!slides.length) return;
        idx = (n + slides.length) % slides.length;
        slides.forEach(function(s, i){ s.classList.toggle('is-active', i === idx); s.setAttribute('aria-hidden', i === idx ? 'false' : 'true'); });
        if (curNum) curNum.textContent = String(idx + 1);
      }
      function play(){ stop(); if (!playing) return; timer = setInterval(function(){ show(idx + 1); }, DELAY); }
      function stop(){ if (timer) { clearInterval(timer); timer = null; } }
      var prev = document.getElementById('prevSlide');
      var next = document.getElementById('nextSlide');
      var tog  = document.getElementById('playToggle');
      var pauseIcon = document.getElementById('pauseIcon');
      var playIcon  = document.getElementById('playIcon');
      if (prev) prev.addEventListener('click', function(){ show(idx - 1); play(); });
      if (next) next.addEventListener('click', function(){ show(idx + 1); play(); });
      if (tog) tog.addEventListener('click', function(){
        playing = !playing;
        tog.setAttribute('aria-pressed', playing ? 'true' : 'false');
        tog.setAttribute('aria-label', playing ? '배너 자동재생 정지' : '배너 자동재생 시작');
        if (pauseIcon) pauseIcon.style.display = playing ? '' : 'none';
        if (playIcon)  playIcon.style.display  = playing ? 'none' : '';
        if (playing) play(); else stop();
      });
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      show(idx);
      if (!reduce) play();
      track.addEventListener('mouseenter', stop);
      track.addEventListener('mouseleave', function(){ if (playing) play(); });
      document.addEventListener('visibilitychange', function(){ if (document.hidden) stop(); else if (playing) play(); });
      document.addEventListener('keydown', function(e){
        if (e.key === 'ArrowLeft' && prev) { show(idx - 1); play(); }
        if (e.key === 'ArrowRight' && next) { show(idx + 1); play(); }
      });
    }

    /* ---------------- 상담 접수 현황 ---------------- */
    var trackEl = document.getElementById('inqTrack');
    if (!trackEl) return;
    var viewEl  = document.getElementById('inqView');
    var totalEl = document.getElementById('inqTotal');
    var btn     = document.getElementById('inqMore');
    var VISIBLE = 6;
    var ridx = 0, rlen = 0, rtimer = null, paused = false, expanded = false, fullList = null;

    function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
    function fmt(s){ var t = String(s||''); return t.length < 10 ? t : t.slice(0,10).replace(/-/g,'.'); }
    function isToday(s){ return String(s||'').slice(0,10) === new Date().toISOString().slice(0,10); }

    function rowHTML(r){
      var badge = r.answered ? '<span class="badge done">답변완료</span>' : '<span class="badge">접수완료</span>';
      var tag = r.kind === 'inquiry' ? '<span class="ktag inq">1:1</span>' : '<span class="ktag con">상담</span>';
      var nw = isToday(r.date) ? '<span class="new">NEW</span>' : '';
      return '<div class="roll-row">'
        + '<span class="c-date">' + esc(fmt(r.date)) + '</span>'
        + '<span class="c-tt">' + tag + '<span class="tt-txt">' + esc(r.title) + '</span>' + nw + '</span>'
        + '<span class="c-who">' + esc(r.author) + '</span>'
        + '<span class="c-st">' + badge + '</span></div>';
    }
    function rowH(){ var el = trackEl.querySelector('.roll-row'); return el ? Math.round(el.getBoundingClientRect().height) : 54; }
    function snap(v){ trackEl.style.transition = 'none'; trackEl.style.transform = 'translateY(-' + (v * rowH()) + 'px)'; }
    function step(){
      if (paused || expanded || rlen <= VISIBLE) return;
      ridx++;
      trackEl.style.transition = 'transform .6s cubic-bezier(.22,.61,.36,1)';
      trackEl.style.transform = 'translateY(-' + (ridx * rowH()) + 'px)';
      if (ridx >= rlen) setTimeout(function(){ ridx = 0; snap(0); }, 620);
    }
    function start(){ if (rtimer) clearInterval(rtimer); rtimer = null; if (rlen > VISIBLE && !expanded) rtimer = setInterval(step, 3200); }
    function stopRoll(){ if (rtimer) { clearInterval(rtimer); rtimer = null; } }

    function paint(list, total){
      if (totalEl) totalEl.textContent = total || 0;
      if (!list.length){
        trackEl.innerHTML = '<div class="roll-row"><span class="c-date">-</span><span class="c-tt">아직 접수된 상담 내역이 없습니다.</span><span class="c-who">-</span><span class="c-st">-</span></div>';
        return;
      }
      rlen = list.length;
      var html = list.map(rowHTML).join('');
      trackEl.innerHTML = (rlen > VISIBLE && !expanded) ? html + html : html;
      ridx = 0; snap(0); start();
    }

    function setExpanded(on){
      expanded = on;
      if (on){
        stopRoll();
        document.getElementById('inqRoll').classList.add('is-expanded');
        if (btn) btn.textContent = '접기';
        if (fullList) { rlen = fullList.length; trackEl.innerHTML = fullList.map(rowHTML).join(''); snap(0); }
        else loadFull();
      } else {
        document.getElementById('inqRoll').classList.remove('is-expanded');
        if (btn) btn.textContent = '전체 보기';
        loadRecent();
      }
    }

    function loadRecent(){
      fetch('/api/posts?page=1&per=30&days=3', { headers: { accept: 'application/json' } })
        .then(function(r){ if(!r.ok) throw 0; return r.json(); })
        .then(function(d){ if(!d||!d.ok) throw 0; paint(d.list||[], d.total||0); })
        .catch(function(){ demo(); });
    }
    function loadFull(){
      fetch('/api/posts?page=1&per=100', { headers: { accept: 'application/json' } })
        .then(function(r){ if(!r.ok) throw 0; return r.json(); })
        .then(function(d){
          if(!d||!d.ok) throw 0;
          fullList = d.list || [];
          if (totalEl) totalEl.textContent = d.total || 0;
          rlen = fullList.length;
          trackEl.innerHTML = fullList.map(rowHTML).join('');
          snap(0);
        })
        .catch(function(){ if (fullList) { rlen = fullList.length; trackEl.innerHTML = fullList.map(rowHTML).join(''); snap(0); } });
    }

    function demo(){
      var seq = [
        ['김*수','사무실 기업용 인터넷 1G 신규 설치 문의',0,0,0],
        ['이*영','기업전화 6회선·대표번호 동시 신청 문의',0,0,1],
        ['박*진','KT IPTV 2대 설치 견적 요청',0,1,1],
        ['정*호','GIGA office 전용회선 개통 절차 문의',0,2,0],
        ['최*미','타사 인터넷에서 KT로 이동 시 위약금 지원 문의',1,2,1],
        ['한*름','사무실 이전에 따른 인터넷·전화 이전 설치 문의',0,3,0],
        ['오*석','무선 인터넷 전화기 추가 구매 문의',1,4,1],
        ['서*아','3인 사무실 기준 요금 안내 요청',0,5,0]
      ];
      var out = seq.map(function(r){
        var d = new Date(); d.setDate(d.getDate() - r[3]);
        var m = String(d.getMonth()+1), dd = String(d.getDate());
        return { title:r[1], author:r[0], kind:r[2]?'inquiry':'consult', answered:!!r[4],
          date: d.getFullYear()+'-'+(m.length<2?'0'+m:m)+'-'+(dd.length<2?'0'+dd:dd)+' 10:00:00' };
      });
      fullList = out;
      paint(out, 128);
    }

    if (btn) btn.addEventListener('click', function(e){ e.preventDefault(); setExpanded(!expanded); });
    viewEl.addEventListener('mouseenter', function(){ paused = true; });
    viewEl.addEventListener('mouseleave', function(){ paused = false; });
    window.addEventListener('resize', function(){ snap(expanded ? 0 : (ridx >= rlen ? 0 : ridx)); });

    loadRecent();
  });
})();
