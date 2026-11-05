
(function(){
  "use strict";
  var API = "/api/posts";
  var PER = 12;
  var state = { page:1, q:"", field:"all", kind:"all", pages:1, total:0 };
  var demo = null;

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c];}); }
  function mask(n){ n=String(n||"").trim(); if(n.length<=1)return "*"; if(n.length===2)return n[0]+"*"; return n[0]+"*".repeat(n.length-2)+n[n.length-1]; }
  function fmt(s){
    var t=String(s||"");
    if(t.length<10) return t;
    return t.replace(/-/g,".").slice(0,10);
  }

  function buildDemo(){
    var raw=[
      ["사무실 기업용 인터넷 1G 설치 문의","김*수",0,0],["기업전화 6회선·대표번호 동시 신청 문의","이*영",1,1],
      ["KT IPTV 2대 견적 요청","박*진",2,0],["GIGA office 전용회선 개통 문의","정*호",3,0],
      ["타사 → KT 이동 위약금 지원 문의","최*미",4,1],["사무실 이전에 따른 이전 설치 문의","한*름",5,0],
      ["무선 인터넷 전화기 추가 구매 문의","오*석",6,0],["3인 사무실 요금 안내 요청","서*아",7,1],
      ["설치 가능 지역 확인 요청","윤*재",8,0],["IPTV 채널 구성표 요청","강*민",9,0],
      ["기업전화 녹취 기능 문의","임*혁",10,1],["전용회선 이중화 상담 요청","백*연",11,0]
    ];
    return raw.map(function(r,i){
      var d=new Date(); d.setDate(d.getDate()-r[2]);
      var m=String(d.getMonth()+1), dd=String(d.getDate());
      return { id:12-i, title:r[0], author:r[1], date:d.getFullYear()+"."+(m.length<2?"0"+m:m)+"."+(dd.length<2?"0"+dd:dd),
        kind: r[3]?"inquiry":"consult", answered: i%3!==0 };
    });
  }

  function renderRows(list,total,pages){
    var tb=$("bdBody"); state.total=total; state.pages=pages;
    if(!list.length){ tb.innerHTML='<tr><td colspan="5" class="bd-empty">아직 접수된 상담 내역이 없습니다.</td></tr>'; }
    else {
      var off=(state.page-1)*PER;
      tb.innerHTML=list.map(function(r,i){
        var no=total-off-i;
        var badge=r.answered?'<span class="badge done">답변완료</span>':'<span class="badge">접수완료</span>';
        var ktag=r.kind==="inquiry"?'<span class="ktag inq">1:1문의</span>':'<span class="ktag con">상담신청</span>';
        return '<tr><td class="no">'+no+'</td><td class="tt">'+ktag+'<span>'+esc(r.title)+'</span></td>'
          +'<td class="who">'+esc(r.author)+'</td><td class="dt">'+esc(fmt(r.date))+'</td><td>'+badge+'</td></tr>';
      }).join("");
    }
    var t=$("bdTotal"); if(t) t.textContent=total;
    renderPager(pages);
  }

  function renderPager(pages){
    var box=$("bdPager"); if(!box) return;
    var cur=state.page,out=[];
    out.push('<button type="button" class="pg nav" data-p="'+(cur-1)+'"'+(cur<=1?' disabled':'')+'>이전</button>');
    var st=Math.max(1,cur-2), en=Math.min(pages,st+4); st=Math.max(1,en-4);
    if(st>1){ out.push('<button type="button" class="pg" data-p="1">1</button>'); if(st>2) out.push('<span class="pg-dots">…</span>'); }
    for(var p=st;p<=en;p++) out.push('<button type="button" class="pg'+(p===cur?' on':'')+'" data-p="'+p+'">'+p+'</button>');
    if(en<pages){ if(en<pages-1) out.push('<span class="pg-dots">…</span>'); out.push('<button type="button" class="pg" data-p="'+pages+'">'+pages+'</button>'); }
    out.push('<button type="button" class="pg nav" data-p="'+(cur+1)+'"'+(cur>=pages?' disabled':'')+'>다음</button>');
    box.innerHTML=out.join("");
  }

  function load(){
    var tb=$("bdBody"); if(tb) tb.innerHTML='<tr><td colspan="5" class="bd-empty">불러오는 중입니다…</td></tr>';
    var qs="?page="+state.page+"&field="+encodeURIComponent(state.field)+"&kind="+encodeURIComponent(state.kind)+"&q="+encodeURIComponent(state.q);
    fetch(API+qs,{headers:{accept:"application/json"}})
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(d){ if(!d||!d.ok) throw 0; renderRows(d.list||[],d.total||0,d.pages||1); })
      .catch(function(){
        if(!demo) demo=buildDemo();
        var rows=demo.filter(function(r){
          if(state.kind!=="all" && r.kind!==state.kind) return false;
          if(!state.q) return true;
          if(state.field==="author") return r.author.indexOf(state.q)>-1;
          return r.title.indexOf(state.q)>-1;
        });
        var pages=Math.max(1,Math.ceil(rows.length/PER));
        if(state.page>pages) state.page=pages;
        renderRows(rows.slice((state.page-1)*PER,state.page*PER),rows.length,pages);
      });
  }

  document.addEventListener("DOMContentLoaded",function(){
    if(!$("bdBody")) return;
    load();
    $("bdSearch").addEventListener("click",function(){ state.q=$("bdQuery").value.trim(); state.field=$("bdField").value; state.page=1; load(); });
    $("bdQuery").addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); $("bdSearch").click(); } });
    if($("bdKind")) $("bdKind").addEventListener("change",function(){ state.kind=$("bdKind").value; state.page=1; load(); });
    $("bdPager").addEventListener("click",function(e){
      var b=e.target.closest("button.pg"); if(!b||b.disabled) return;
      var p=parseInt(b.dataset.p,10); if(p<1||p>state.pages) return;
      state.page=p; load();
      var t=document.querySelector(".bd-board"); if(t) t.scrollIntoView({behavior:"smooth",block:"start"});
    });
  });
})();
