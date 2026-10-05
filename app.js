const BASE = "https://resultados.tse.jus.br/oficial/ele2026";
const ELEICAO_PRESIDENTE = 6257;
const ELEICAO_ESTADUAL = 6259;
const CARGO_PRESIDENTE = 1;
const CARGO_GOVERNADOR = 3;
const CARGO_SENADOR = 5;
const POLL_SECONDS = 15;
const FINAL_STABLE_CHECKS = 3;
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const REGIONS = {
  N:new Set(["AC","AP","AM","PA","RO","RR","TO"]),
  NE:new Set(["AL","BA","CE","MA","PB","PE","PI","RN","SE"]),
  CO:new Set(["DF","GO","MT","MS"]),
  SE:new Set(["ES","MG","RJ","SP"]),
  S:new Set(["PR","RS","SC"])
};

const $ = id => document.getElementById(id);
const fmtPct = v => (v === null || v === undefined) ? "—" : Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%";
const fmtInt = v => (v === null || v === undefined) ? "—" : Number(v).toLocaleString("pt-BR");
const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const party = s => s ? `<span class="party">${esc(s)}</span>` : "—";
const normalize = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toUpperCase();
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));

function asNumber(v){
  if(v===null||v===undefined||v==="") return 0;
  if(typeof v==="number") return v;
  let s=String(v).trim().replace("%","");
  if(s.includes(",")&&s.includes(".")) s=s.replaceAll(".","").replace(",","."); else s=s.replace(",",".");
  const n=Number(s); return Number.isFinite(n)?n:0;
}
function resultUrl(uf,cargo,eleicao){
  const u=uf.toLowerCase();
  return `${BASE}/${eleicao}/dados/${u}/${u}-c${String(cargo).padStart(4,"0")}-e${String(eleicao).padStart(6,"0")}-u.json`;
}
function trackingUrl(eleicao){
  return `${BASE}/${eleicao}/dados/br/br-e${String(eleicao).padStart(6,"0")}-ab.json`;
}
async function getJson(url){
  const response=await fetch(url,{cache:"no-store",headers:{"Accept":"application/json,text/plain,*/*"}});
  if(!response.ok) throw new Error(`HTTP ${response.status} — ${url}`);
  return response.json();
}
async function mapLimit(items,limit,worker){
  const out=new Array(items.length); let cursor=0;
  async function runner(){ while(cursor<items.length){ const i=cursor++; out[i]=await worker(items[i],i); } }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},runner));
  return out;
}
function flattenCandidates(data){
  const rows=[];
  for(const cargo of (data.carg||[])) for(const agr of (cargo.agr||[])) for(const par of (agr.par||[])) for(const cand of (par.cand||[])){
    const pct=(cand.pvapn!==null&&cand.pvapn!==undefined&&cand.pvapn!=="")?cand.pvapn:cand.pvap;
    rows.push({name:cand.nmu||cand.nm||"",full_name:cand.nm||"",party:par.sg||"",number:cand.n,votes:Math.trunc(asNumber(cand.vap)),pct:asNumber(pct),status:cand.st||"",elected:String(cand.e||"n").toLowerCase()==="s"});
  }
  return rows.sort((a,b)=>(b.votes-a.votes)||(b.pct-a.pct));
}
function sectionsPct(data){
  const s=data.s||{};
  let p=(s.pstn!==null&&s.pstn!==undefined&&s.pstn!=="")?s.pstn:s.pst;
  let val=asNumber(p);
  if(!val){ const total=asNumber(s.ts),done=asNumber(s.st); if(total) val=100*done/total; }
  return val;
}
function generationInfo(data){ return {generation_date:data.dg||"",generation_time:data.hg||"",progress:sectionsPct(data),idg:data.idg??null}; }
function matchCandidate(candidates,aliases){
  const a=aliases.map(normalize);
  for(const field of ["name","full_name"]) for(const c of candidates){ const n=normalize(c[field]); if(a.some(x=>n.includes(x))) return c; }
  return null;
}
const compact = c => c ? {name:c.name,party:c.party,votes:c.votes,pct:c.pct,status:c.status,elected:!!c.elected} : null;
function parsePresident(data){
  const all=flattenCandidates(data),lula=matchCandidate(all,["LULA"]),flavio=matchCandidate(all,["FLAVIO","FLAVIO BOLSONARO"]);
  return {all,lula,flavio,meta:generationInfo(data)};
}
function parseStatePresident(data){
  const c=flattenCandidates(data),lula=matchCandidate(c,["LULA"]),flavio=matchCandidate(c,["FLAVIO","FLAVIO BOLSONARO"]);
  return {lula:compact(lula),flavio:compact(flavio),diff:(lula&&flavio)?lula.pct-flavio.pct:null,diffVotes:(lula&&flavio)?lula.votes-flavio.votes:null,progress:sectionsPct(data),idg:data.idg??null};
}
function parseGovernor(data){
  const c=flattenCandidates(data);
  const first=compact(c[0]),second=compact(c[1]),third=compact(c[2]);
  const gap=(second&&third)?Math.max(0,second.pct-third.pct):null;
  return {first,second,third,gap,md:String(data.md||"n").toLowerCase(),progress:sectionsPct(data),idg:data.idg??null};
}
function parseSenate(data){
  const c=flattenCandidates(data);
  const first=compact(c[0]),second=compact(c[1]),third=compact(c[2]);
  const gap=(second&&third)?Math.max(0,second.pct-third.pct):null;
  const remainingRaw=data.e?.esnt;
  const remainingElectors=(remainingRaw===null||remainingRaw===undefined||remainingRaw==="")?null:asNumber(remainingRaw);
  if(third&&remainingElectors!==null){
    const maxChallengerVotes=third.votes+remainingElectors;
    if(first) first.mathGuaranteed=first.votes>maxChallengerVotes;
    if(second) second.mathGuaranteed=second.votes>maxChallengerVotes;
  }
  return {first,second,third,gap,remainingElectors,progress:sectionsPct(data),idg:data.idg??null};
}
function trackerMap(data){
  const m=new Map();
  for(const a of (data.abr||[])){
    const code=String(a.cdabr||"").toUpperCase();
    if(!code) continue;
    m.set(code,{signature:`${a.dt||""}|${a.ht||""}|${a.s?.st??""}|${a.and||""}`,progress:asNumber(a.s?.pstn??a.s?.pst)});
  }
  return m;
}

const model={
  national:null,
  states:new Map(),
  governors:new Map(),
  senate:new Map(),
  trackers:{pres:new Map(),senate:new Map()},
  pendingPres:new Set(),
  pendingGovernor:new Set(),
  pendingSenate:new Set(),
  pendingNational:false,
  initialized:false,
  lastQueryAt:null,
  lastChangeAt:null,
  errors:[]
};
const prefs={
  region:localStorage.getItem("tse.region")||"ALL",
  close:localStorage.getItem("tse.close")==="1",
  progressed:localStorage.getItem("tse.progressed")==="1",
  sortKey:localStorage.getItem("tse.sortKey")||"uf",
  sortDir:localStorage.getItem("tse.sortDir")||"asc"
};

function setStatus(kind,text){ $("dot").className="dot "+kind; $("statusText").textContent=text; }
function announce(text){ $("liveStatus").textContent=text; }
function candidateName(c){ return c?esc(c.name||"—"):"—"; }
function valueKey(v){ return v===null||v===undefined?"":String(v); }
function leaderClass(diff,side){ if(diff===null||diff===undefined) return ""; const x=Number(diff); if(x>0&&side==="lula")return"lead-lula"; if(x<0&&side==="flavio")return"lead-flavio"; return""; }
function diffClass(diff){ if(diff===null||diff===undefined)return""; const x=Number(diff); return x>0?"lead-lula":x<0?"lead-flavio":""; }
function leaderText(diff){
  if(diff===null||diff===undefined) return "—";
  const x=Number(diff),m=Math.abs(x).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  if(x>0) return `<span class="leader-name"><span class="leader-arrow" aria-hidden="true">▲</span>Lula +${m} p.p.</span>`;
  if(x<0) return `<span class="leader-name"><span class="leader-arrow" aria-hidden="true">▲</span>Flávio +${m} p.p.</span>`;
  return "Empate";
}
function leaderVotesText(diffVotes){
  if(diffVotes===null||diffVotes===undefined) return "—";
  const x=Number(diffVotes),m=Math.abs(x).toLocaleString("pt-BR");
  if(x>0) return `<span class="leader-name"><span class="leader-arrow" aria-hidden="true">▲</span>Lula +${m}</span>`;
  if(x<0) return `<span class="leader-name"><span class="leader-arrow" aria-hidden="true">▲</span>Flávio +${m}</span>`;
  return "Empate";
}
function candidateKey(c){ return c?`${c.name}|${c.party}`:"—"; }
function governorBadge(row,position){
  const c=position===1?row.first:position===2?row.second:row.third;
  if(c?.elected) return '<span class="elected-badge" title="Condição de eleito atribuída oficialmente pelo TSE">✓ Eleito TSE</span>';
  if(row.md==="e"&&position===1) return '<span class="math-official-badge" title="O TSE informa md=e: eleição matematicamente definida com eleito no 1º turno">🔒 Eleito matematicamente</span>';
  if(row.md==="s"&&(position===1||position===2)) return '<span class="runoff-badge" title="O TSE informa md=s: eleição matematicamente definida para segundo turno">↪ 2º turno definido</span>';
  return "";
}
function seatBadge(c){
  if(c?.elected) return '<span class="elected-badge" title="Condição de eleito atribuída oficialmente pelo TSE">✓ Eleito TSE</span>';
  if(c?.mathGuaranteed) return '<span class="math-badge" title="Cálculo conservador do painel: os votos atuais superam o máximo que o 3º colocado alcançaria mesmo recebendo um voto de cada eleitor ainda em seção não totalizada. Não substitui a atribuição oficial do TSE.">🔒 Vaga garantida</span>';
  return "";
}

function syncTable(tbodyId,rows,keyFn,cellsFn){
  const tbody=$(tbodyId);
  tbody.querySelectorAll("tr:not([data-key])").forEach(tr=>tr.remove());
  const existing=new Map([...tbody.querySelectorAll("tr[data-key]")].map(tr=>[tr.dataset.key,tr]));
  if(!rows.length){ tbody.innerHTML=`<tr><td colspan="20" class="msg">Nenhum registro corresponde aos filtros.</td></tr>`; return; }
  const wanted=new Set();
  for(const row of rows){
    const key=keyFn(row); wanted.add(key);
    let tr=existing.get(key);
    if(!tr){ tr=document.createElement("tr"); tr.dataset.key=key; }
    const cells=cellsFn(row);
    while(tr.children.length<cells.length) tr.appendChild(document.createElement("td"));
    while(tr.children.length>cells.length) tr.lastElementChild.remove();
    cells.forEach((cell,i)=>{
      const td=tr.children[i];
      const old=td.dataset.value;
      const next=valueKey(cell.value);
      td.className=cell.className||"";
      if(cell.label) td.dataset.label=cell.label; else delete td.dataset.label;
      if(td.innerHTML!==cell.html) td.innerHTML=cell.html;
      if(old!==undefined&&old!==next){ td.classList.remove("cell-flash"); void td.offsetWidth; td.classList.add("cell-flash"); }
      td.dataset.value=next;
    });
    tbody.appendChild(tr);
  }
  for(const [key,tr] of existing) if(!wanted.has(key)) tr.remove();
}

function visibleStates(){
  let rows=UFS.map(uf=>({uf,...(model.states.get(uf)||{lula:null,flavio:null,diff:null,diffVotes:null,progress:null})}));
  if(prefs.region!=="ALL") rows=rows.filter(r=>REGIONS[prefs.region]?.has(r.uf));
  if(prefs.close) rows=rows.filter(r=>r.diff!==null&&Math.abs(r.diff)<5);
  if(prefs.progressed) rows=rows.filter(r=>Number(r.progress)>=50);
  const key=prefs.sortKey,dir=prefs.sortDir==="asc"?1:-1;
  rows.sort((a,b)=>{
    if(key==="uf") return a.uf.localeCompare(b.uf,"pt-BR")*dir;
    const av=key==="lula"?(a.lula?.pct??-Infinity):key==="flavio"?(a.flavio?.pct??-Infinity):(a[key]??-Infinity);
    const bv=key==="lula"?(b.lula?.pct??-Infinity):key==="flavio"?(b.flavio?.pct??-Infinity):(b[key]??-Infinity);
    return (Number(av)-Number(bv))*dir;
  });
  return rows;
}
function renderPresident(){
  if(!model.national) return;
  const {all,lula,flavio}=model.national;
  const keep=new Set([lula,flavio].filter(Boolean).map(c=>`${c.name}|${c.party}|${c.number}`));
  const rows=all.filter(c=>c.pct>1||keep.has(`${c.name}|${c.party}|${c.number}`));
  syncTable("presBody",rows,c=>`${c.name}|${c.party}`,c=>[
    {html:`<strong>${candidateName(c)}</strong>`,value:c.name},
    {html:party(c.party),value:c.party},
    {html:fmtInt(c.votes),value:c.votes,className:"num"},
    {html:`<div class="pct-wrap"><span class="pct-bar" style="--w:${clamp(c.pct,0,100)}%"></span><span class="pct-value">${fmtPct(c.pct)}</span></div>`,value:c.pct,className:"num"}
  ]);
}
function governorStatus(row){
  if(row.md==="s") return '<span class="governor-status runoff">↪ 2º turno</span>';
  if(row.md==="e") return '<span class="governor-status decided">🔒 1º turno definido</span>';
  if(row.first?.elected) return '<span class="governor-status decided">✓ Eleito TSE</span>';
  return '<span class="governor-status">Em apuração</span>';
}
function renderGovernors(){
  const rows=UFS.map(uf=>({uf,...(model.governors.get(uf)||{first:null,second:null,third:null,gap:null,md:"n",progress:null})}));
  syncTable("govBody",rows,r=>r.uf,r=>[
    {html:`<strong>${esc(r.uf)}</strong>`,value:r.uf,label:"UF"},
    {html:governorStatus(r),value:r.md,label:"Situação"},
    {html:`<span class="rank-badge">1º</span><span class="mobile-rank">${candidateName(r.first)}</span>${governorBadge(r,1)}`,value:`${candidateKey(r.first)}|${r.md}`,label:"1º colocado"},
    {html:r.first?party(r.first.party):"—",value:r.first?.party,label:"Partido"},
    {html:r.first?fmtPct(r.first.pct):"—",value:r.first?.pct,className:"num",label:"%"},
    {html:`<span class="rank-badge">2º</span><span class="mobile-rank">${candidateName(r.second)}</span>${governorBadge(r,2)}`,value:`${candidateKey(r.second)}|${r.md}`,label:"2º colocado"},
    {html:r.second?party(r.second.party):"—",value:r.second?.party,label:"Partido"},
    {html:r.second?fmtPct(r.second.pct):"—",value:r.second?.pct,className:"num",label:"%"},
    {html:`<span class="rank-badge outside-rank">3º</span><span class="mobile-rank">${candidateName(r.third)}</span>`,value:candidateKey(r.third),className:"outside-seat",label:"3º colocado · fora da faixa"},
    {html:r.third?party(r.third.party):"—",value:r.third?.party,className:"outside-seat",label:"Partido"},
    {html:r.third?fmtPct(r.third.pct):"—",value:r.third?.pct,className:"num outside-seat",label:"%"},
    {html:r.gap===null||r.gap===undefined?"—":`<span class="gap-to-seat">${fmtPct(r.gap).replace("%"," p.p.")}</span>`,value:r.gap,className:"num outside-seat",label:"Distância para o 2º"},
    {html:fmtPct(r.progress),value:r.progress,className:"num",label:"Seções totalizadas"}
  ]);
}
function renderStates(){
  const rows=visibleStates();
  $("stateCount").textContent=`${rows.length} ${rows.length===1?"UF":"UFs"}`;
  syncTable("stateBody",rows,r=>r.uf,r=>[
    {html:`<strong>${esc(r.uf)}</strong>`,value:r.uf},
    {html:r.lula?fmtPct(r.lula.pct):"—",value:r.lula?.pct,className:`num ${leaderClass(r.diff,"lula")}`.trim()},
    {html:r.flavio?fmtPct(r.flavio.pct):"—",value:r.flavio?.pct,className:`num ${leaderClass(r.diff,"flavio")}`.trim()},
    {html:leaderText(r.diff),value:r.diff,className:`num ${diffClass(r.diff)}`.trim()},
    {html:leaderVotesText(r.diffVotes),value:r.diffVotes,className:`num ${diffClass(r.diffVotes)}`.trim()},
    {html:fmtPct(r.progress),value:r.progress,className:"num"}
  ]);
  updateSortIndicators();
}
function renderSenate(){
  const rows=UFS.map(uf=>({uf,...(model.senate.get(uf)||{first:null,second:null,third:null,gap:null,progress:null})}));
  syncTable("senBody",rows,r=>r.uf,r=>[
    {html:`<strong>${esc(r.uf)}</strong>`,value:r.uf,label:"UF"},
    {html:`<span class="rank-badge">1º</span><span class="mobile-rank">${candidateName(r.first)}</span>${seatBadge(r.first)}`,value:`${candidateKey(r.first)}|${r.first?.elected?"eleito-tse":r.first?.mathGuaranteed?"garantida":"aberta"}`,label:"1º colocado"},
    {html:r.first?party(r.first.party):"—",value:r.first?.party,label:"Partido"},
    {html:r.first?fmtPct(r.first.pct):"—",value:r.first?.pct,className:"num",label:"%"},
    {html:`<span class="rank-badge">2º</span><span class="mobile-rank">${candidateName(r.second)}</span>${seatBadge(r.second)}`,value:`${candidateKey(r.second)}|${r.second?.elected?"eleito-tse":r.second?.mathGuaranteed?"garantida":"aberta"}`,label:"2º colocado"},
    {html:r.second?party(r.second.party):"—",value:r.second?.party,label:"Partido"},
    {html:r.second?fmtPct(r.second.pct):"—",value:r.second?.pct,className:"num",label:"%"},
    {html:`<span class="rank-badge outside-rank">3º</span><span class="mobile-rank">${candidateName(r.third)}</span>`,value:candidateKey(r.third),className:"outside-seat",label:"3º colocado · fora das vagas"},
    {html:r.third?party(r.third.party):"—",value:r.third?.party,className:"outside-seat",label:"Partido"},
    {html:r.third?fmtPct(r.third.pct):"—",value:r.third?.pct,className:"num outside-seat",label:"%"},
    {html:r.gap===null||r.gap===undefined?"—":`<span class="gap-to-seat">${fmtPct(r.gap).replace("%"," p.p.")}</span>`,value:r.gap,className:"num outside-seat",label:"Distância para o 2º"},
    {html:fmtPct(r.progress),value:r.progress,className:"num",label:"Seções totalizadas"}
  ]);
}
function renderMeta(){
  if(!model.national) return;
  const p=clamp(model.national.meta.progress||0,0,100);
  $("progress").textContent=fmtPct(p);
  $("progressBar").style.width=`${p}%`;
  $("progressTrack").setAttribute("aria-valuenow",String(p));
  $("tseTime").textContent=(model.national.meta.generation_time||"—")+(model.national.meta.generation_date?" · "+model.national.meta.generation_date:"");
  if(model.lastQueryAt) $("fetchTime").textContent=model.lastQueryAt.toLocaleTimeString("pt-BR");
}
function renderErrors(){
  const box=$("errors");
  if(model.errors.length){ box.style.display="block"; box.textContent=`Falha temporária em ${model.errors.length} consulta(s). Quando já havia dado carregado, a última leitura foi mantida.`; box.title=model.errors.slice(0,6).join("\n"); }
  else { box.style.display="none"; box.textContent=""; box.removeAttribute("title"); }
}
function renderAll(){ renderMeta(); renderPresident(); renderGovernors(); renderStates(); renderSenate(); renderErrors(); }

async function fetchPresidentUF(uf){
  const old=model.states.get(uf);
  const data=await getJson(resultUrl(uf,CARGO_PRESIDENTE,ELEICAO_PRESIDENTE));
  const next=parseStatePresident(data); model.states.set(uf,next);
  return !old||old.idg!==next.idg;
}
async function fetchGovernorUF(uf){
  const old=model.governors.get(uf);
  const data=await getJson(resultUrl(uf,CARGO_GOVERNADOR,ELEICAO_ESTADUAL));
  const next=parseGovernor(data); model.governors.set(uf,next);
  return !old||old.idg!==next.idg;
}
async function fetchSenateUF(uf){
  const old=model.senate.get(uf);
  const data=await getJson(resultUrl(uf,CARGO_SENADOR,ELEICAO_ESTADUAL));
  const next=parseSenate(data); model.senate.set(uf,next);
  return !old||old.idg!==next.idg;
}
async function fetchNational(){
  const old=model.national?.meta?.idg;
  const data=await getJson(resultUrl("br",CARGO_PRESIDENTE,ELEICAO_PRESIDENTE));
  model.national=parsePresident(data);
  return old!==model.national.meta.idg;
}
async function refreshTrackers(){
  const [p,s]=await Promise.all([getJson(trackingUrl(ELEICAO_PRESIDENTE)),getJson(trackingUrl(ELEICAO_ESTADUAL))]);
  return {pres:trackerMap(p),senate:trackerMap(s)};
}
function detectChanges(next){
  const prevP=model.trackers.pres,prevS=model.trackers.senate;
  if(prevP.size){
    for(const [code,item] of next.pres){ if(prevP.get(code)?.signature!==item.signature){ if(code==="BR") model.pendingNational=true; else if(UFS.includes(code)) model.pendingPres.add(code); } }
  }
  if(prevS.size){
    for(const [code,item] of next.senate){ if(prevS.get(code)?.signature!==item.signature&&UFS.includes(code)){ model.pendingGovernor.add(code); model.pendingSenate.add(code); } }
  }
  model.trackers=next;
}

async function initialLoad(){
  model.errors=[];
  const trackerPromise=refreshTrackers().catch(e=>{model.errors.push(e.message);return null;});
  await fetchNational();
  const tasks=UFS.flatMap(uf=>[{kind:"pres",uf},{kind:"governor",uf},{kind:"senate",uf}]);
  let changed=0;
  await mapLimit(tasks,8,async task=>{
    try{ const c=task.kind==="pres"?await fetchPresidentUF(task.uf):task.kind==="governor"?await fetchGovernorUF(task.uf):await fetchSenateUF(task.uf); if(c) changed++; }
    catch(e){ model.errors.push(e.message); }
  });
  const trackers=await trackerPromise; if(trackers) model.trackers=trackers;
  model.pendingNational=false; model.pendingPres.clear(); model.pendingGovernor.clear(); model.pendingSenate.clear(); model.initialized=true;
  return changed;
}
async function incrementalLoad(force=false){
  model.errors=[];
  if(force){
    let changed=(await fetchNational())?1:0;
    const tasks=UFS.flatMap(uf=>[{kind:"pres",uf},{kind:"governor",uf},{kind:"senate",uf}]);
    await mapLimit(tasks,8,async task=>{ try{ const c=task.kind==="pres"?await fetchPresidentUF(task.uf):task.kind==="governor"?await fetchGovernorUF(task.uf):await fetchSenateUF(task.uf); if(c) changed++; }catch(e){model.errors.push(e.message);} });
    const trackers=await refreshTrackers().catch(e=>{model.errors.push(e.message);return null;}); if(trackers) model.trackers=trackers;
    model.pendingNational=false; model.pendingPres.clear(); model.pendingGovernor.clear(); model.pendingSenate.clear(); return changed;
  }

  const trackers=await refreshTrackers();
  detectChanges(trackers);
  let changed=0;
  if(model.pendingNational){
    try{ const c=await fetchNational(); if(c){changed++;model.pendingNational=false;} }
    catch(e){model.errors.push(e.message);}
  }
  const pufs=[...model.pendingPres],gufs=[...model.pendingGovernor],sufs=[...model.pendingSenate];
  await mapLimit(pufs,6,async uf=>{ try{ const c=await fetchPresidentUF(uf); if(c){changed++;model.pendingPres.delete(uf);} }catch(e){model.errors.push(e.message);} });
  await mapLimit(gufs,6,async uf=>{ try{ const c=await fetchGovernorUF(uf); if(c){changed++;model.pendingGovernor.delete(uf);} }catch(e){model.errors.push(e.message);} });
  await mapLimit(sufs,6,async uf=>{ try{ const c=await fetchSenateUF(uf); if(c){changed++;model.pendingSenate.delete(uf);} }catch(e){model.errors.push(e.message);} });
  return changed;
}

let loading=false,remaining=POLL_SECONDS,paused=false,pollingComplete=false,finalStableChecks=0;

function allTalliesComplete(){
  if(!model.national || Number(model.national.meta?.progress)<100) return false;
  for(const uf of UFS){
    if(Number(model.states.get(uf)?.progress)<100) return false;
    if(Number(model.governors.get(uf)?.progress)<100) return false;
    if(Number(model.senate.get(uf)?.progress)<100) return false;
  }
  return true;
}
function updateCompletionState(changed,{firstRun=false}={}){
  const complete=allTalliesComplete() && model.errors.length===0;
  if(!complete){
    finalStableChecks=0;
    if(pollingComplete){
      pollingComplete=false;
      applyPauseState({announceChange:false});
    }
    return false;
  }
  if(changed>0 || firstRun){
    finalStableChecks=0;
    if(pollingComplete){
      pollingComplete=false;
      applyPauseState({announceChange:false});
    }
    return false;
  }
  if(!pollingComplete) finalStableChecks++;
  if(finalStableChecks>=FINAL_STABLE_CHECKS){
    pollingComplete=true;
    paused=false;
    applyPauseState({announceChange:false});
    return true;
  }
  return false;
}
function applyPauseState({announceChange=true}={}){
  const button=$("pauseUpdates");
  if(pollingComplete){
    button.disabled=true;
    button.setAttribute("aria-pressed","false");
    button.setAttribute("aria-label","Apuração concluída");
    button.innerHTML='<span class="control-icon" aria-hidden="true">✓</span><span class="control-label">Concluída</span>';
    button.title="Apuração concluída; as atualizações automáticas foram encerradas";
    $("countdown").textContent="concluída";
    if(!loading) setStatus("ok","Apuração concluída");
    return;
  }
  button.disabled=false;
  button.setAttribute("aria-pressed",String(paused));
  button.setAttribute("aria-label",paused?"Retomar atualizações automáticas":"Pausar atualizações automáticas");
  button.innerHTML=paused?'<span class="control-icon" aria-hidden="true">▶</span><span class="control-label">Retomar</span>':'<span class="control-icon" aria-hidden="true">⏸</span><span class="control-label">Pausar</span>';
  button.title=paused?"Retoma as atualizações automáticas":"Pausa as atualizações automáticas sem alterar os dados na tela";
  if(paused){
    $("countdown").textContent="pausadas";
    if(!loading) setStatus("wait","Atualizações pausadas");
    if(announceChange) announce("Atualizações automáticas pausadas. Os dados permanecerão fixos até você retomar ou verificar manualmente.");
  }else{
    remaining=POLL_SECONDS;
    $("countdown").textContent=remaining+" s";
    if(model.initialized){ renderAll(); setStatus("ok","Atualizações retomadas"); }
    if(announceChange) announce("Atualizações automáticas retomadas.");
  }
}
async function load({force=false,manual=false}={}){
  if(loading) return;
  const firstRun=!model.initialized;
  loading=true; $("refresh").disabled=true; setStatus("wait","Consultando TSE…");
  try{
    const changed=model.initialized?await incrementalLoad(force):await initialLoad();
    model.lastQueryAt=new Date(); if(changed>0||!model.lastChangeAt) model.lastChangeAt=new Date();
    const justCompleted=updateCompletionState(changed,{firstRun});
    const freezeAutomaticResult=paused&&!manual&&!firstRun;
    if(!freezeAutomaticResult) renderAll();
    if(justCompleted){
      setStatus("ok","Apuração concluída · atualizações automáticas encerradas");
      announce("Apuração concluída. As atualizações automáticas foram encerradas; o botão Verificar agora continua disponível.");
    }else if(paused){
      if(manual){ const text=changed>0?`Verificado · ${changed} conjunto(s) alterado(s) · pausado`:"Verificado · sem alteração · pausado"; setStatus("wait",text); announce(text); }
      else setStatus("wait","Atualizações pausadas");
    }else if(firstRun){ setStatus("ok","Dados carregados"); announce("Dados carregados."); }
    else if(changed>0){ const text=`Dados atualizados · ${changed} conjunto(s) alterado(s)`; setStatus("ok",text); announce(text); }
    else { const t=model.lastChangeAt?.toLocaleTimeString("pt-BR")||model.lastQueryAt.toLocaleTimeString("pt-BR"); setStatus("ok",`Sem alteração desde ${t}`); }
  }catch(e){
    model.errors.push(e.message||String(e)); model.lastQueryAt=new Date(); renderErrors(); renderMeta();
    setStatus("err",model.initialized?"Falha temporária · última leitura mantida":"Erro ao consultar TSE");
    announce("Falha temporária na atualização. A última leitura disponível foi mantida.");
  }finally{ loading=false; $("refresh").disabled=false; remaining=POLL_SECONDS; }
}

function updateSortIndicators(){
  document.querySelectorAll("[data-sort-th]").forEach(th=>{
    const key=th.dataset.sortTh,active=key===prefs.sortKey;
    th.setAttribute("aria-sort",active?(prefs.sortDir==="asc"?"ascending":"descending"):"none");
    const indicator=th.querySelector(".sort-indicator"); if(indicator) indicator.textContent=active?(prefs.sortDir==="asc"?"▲":"▼"):"";
  });
}
function persistFilters(){
  localStorage.setItem("tse.region",prefs.region); localStorage.setItem("tse.close",prefs.close?"1":"0"); localStorage.setItem("tse.progressed",prefs.progressed?"1":"0"); localStorage.setItem("tse.sortKey",prefs.sortKey); localStorage.setItem("tse.sortDir",prefs.sortDir);
}
function syncFilterControls(){
  document.querySelectorAll(".region-chip").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.region===prefs.region)));
  $("closeFilter").setAttribute("aria-pressed",String(prefs.close)); $("progressFilter").setAttribute("aria-pressed",String(prefs.progressed));
}
function initControls(){
  document.querySelectorAll(".region-chip").forEach(b=>b.addEventListener("click",()=>{prefs.region=b.dataset.region;persistFilters();syncFilterControls();renderStates();}));
  $("closeFilter").addEventListener("click",()=>{prefs.close=!prefs.close;persistFilters();syncFilterControls();renderStates();});
  $("progressFilter").addEventListener("click",()=>{prefs.progressed=!prefs.progressed;persistFilters();syncFilterControls();renderStates();});
  $("resetFilters").addEventListener("click",()=>{prefs.region="ALL";prefs.close=false;prefs.progressed=false;persistFilters();syncFilterControls();renderStates();});
  document.querySelectorAll(".sort-btn").forEach(b=>b.addEventListener("click",()=>{const key=b.dataset.sort;if(prefs.sortKey===key)prefs.sortDir=prefs.sortDir==="asc"?"desc":"asc";else{prefs.sortKey=key;prefs.sortDir=key==="uf"?"asc":"desc";}persistFilters();renderStates();}));
  $("pauseUpdates").addEventListener("click",()=>{paused=!paused;applyPauseState();});
  $("refresh").addEventListener("click",()=>{remaining=0;load({manual:true});});
}
function initTheme(){
  const saved=localStorage.getItem("tse.theme"); const dark=saved?saved==="dark":window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(dark?"dark":"light");
  $("themeToggle").addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";applyTheme(next);localStorage.setItem("tse.theme",next);});
}
function applyTheme(theme){
  document.documentElement.dataset.theme=theme; const dark=theme==="dark"; $("themeToggle").setAttribute("aria-pressed",String(dark)); $("themeToggle").textContent=dark?"Tema claro":"Tema escuro";
}

$("pollLabel").textContent=POLL_SECONDS;
initTheme(); initControls(); syncFilterControls(); updateSortIndicators(); applyPauseState({announceChange:false});
setInterval(()=>{
  if(pollingComplete){ $("countdown").textContent="concluída"; return; }
  if(paused){ $("countdown").textContent="pausadas"; return; }
  if(!loading) remaining--;
  if(remaining<=0){remaining=POLL_SECONDS;load();}
  $("countdown").textContent=loading?"consultando…":Math.max(0,remaining)+" s";
},1000);
load();
