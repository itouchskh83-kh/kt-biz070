
(function(){
  "use strict";
  var header=document.getElementById('header');
  var onScroll=function(){ if(header) header.classList.toggle('is-stuck', window.scrollY>8); };
  onScroll(); window.addEventListener('scroll',onScroll,{passive:true});

  var drawer=document.getElementById('drawer'), menuBtn=document.getElementById('menuBtn');
  function openDrawer(){ if(!drawer) return; drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden','false'); menuBtn.setAttribute('aria-expanded','true'); document.body.style.overflow='hidden'; }
  function closeDrawer(){ if(!drawer) return; drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden','true'); menuBtn.setAttribute('aria-expanded','false'); document.body.style.overflow=''; }
  if(menuBtn) menuBtn.addEventListener('click',openDrawer);
  document.querySelectorAll('[data-close-drawer]').forEach(function(el){ el.addEventListener('click',closeDrawer); });
  document.querySelectorAll('.drawer-nav a').forEach(function(a){ a.addEventListener('click',closeDrawer); });

  var quick=document.getElementById('quick'), qt=document.getElementById('quickToggle');
  if(qt) qt.addEventListener('click',function(){
    var hidden=quick.classList.toggle('is-hidden');
    qt.textContent=hidden?'열기':'접기';
    qt.setAttribute('aria-label',hidden?'상담 위젯 열기':'상담 위젯 접기');
  });

  var modal=document.getElementById('modal');
  function openModal(){ if(!modal) return; modal.classList.add('is-open'); document.body.style.overflow='hidden'; var f=document.getElementById('fName'); if(f) setTimeout(function(){f.focus();},60); }
  function closeModal(){ if(!modal) return; modal.classList.remove('is-open'); document.body.style.overflow=''; }
  document.querySelectorAll('[data-open-modal]').forEach(function(b){ b.addEventListener('click',function(e){ e.preventDefault(); openModal(); }); });
  document.querySelectorAll('[data-close-modal]').forEach(function(b){ b.addEventListener('click',closeModal); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'){ closeModal(); closeDrawer(); } });

  var form=document.getElementById('consultForm');
  if(form){
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var ok=true;
      form.querySelectorAll('[data-req]').forEach(function(input){
        var v=(input.value||'').trim();
        var bad=!v;
        if(input.type==='checkbox') bad=!input.checked;
        if(input.dataset.type==='tel' && v) bad=!/^[0-9\-+() ]{9,20}$/.test(v);
        var field=input.closest('.field')||input.closest('.agree-wrap');
        if(field) field.classList.toggle('err',bad);
        if(bad) ok=false;
      });
      if(!ok) return;
      form.style.display='none';
      var done=document.getElementById('done'); if(done) done.classList.add('is-on');
      var t=document.getElementById('modalTitle'); if(t) t.textContent='접수 완료';
    });
  }

  var goTop=document.getElementById('goTop');
  if(goTop) goTop.addEventListener('click',function(){ window.scrollTo({top:0,behavior:'smooth'}); });

  // calculator
  var calc=document.getElementById('calcForm');
  if(calc){
    var PRICE={'1':30000,'2':40000,'3':50000,'4':60000,'5':70000,'6':80000,'7':90000,'8':100000,'9':110000,'10':120000};
    var BASE={'none':0,'basic':150000,'full':350000};
    function money(n){ return n.toLocaleString('ko-KR'); }
    function update(){
      var lines=calc.querySelector('[name=lines]').value;
      var setup=calc.querySelector('[name=setup]').value;
      var extra=calc.querySelector('[name=extra]').value;
      var lineCost = PRICE[lines] || (lines*10000);
      var setupCost = BASE[setup]||0;
      var extraCost = extra==='wifi'?220000:extra==='rack'?280000:extra==='outdoor'?180000:0;
      var total=lineCost+setupCost+extraCost;
      document.getElementById('cLines').textContent=money(lineCost)+'원';
      document.getElementById('cSetup').textContent=money(setupCost)+'원';
      document.getElementById('cExtra').textContent=money(extraCost)+'원';
      document.getElementById('cTotal').textContent=money(total)+'원';
    }
    calc.addEventListener('change',update); calc.addEventListener('input',update); update();
  }
})();

(function(){
  var fab=document.getElementById('chatFab'), panel=document.getElementById('chatPanel'), close=document.getElementById('chatClose');
  if(!fab||!panel) return;
  function open(v){ panel.classList.toggle('is-open',v); fab.setAttribute('aria-expanded', v?'true':'false'); }
  fab.addEventListener('click', function(){ open(!panel.classList.contains('is-open')); });
  close.addEventListener('click', function(){ open(false); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') open(false); });
  document.addEventListener('click', function(e){ if(!panel.contains(e.target) && !fab.contains(e.target)) open(false); });
})();
