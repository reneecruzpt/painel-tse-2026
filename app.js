const BASE = "https://resultados.tse.jus.br/oficial/ele2026";
const ELEICAO_PRESIDENTE = 6257;
const ELEICAO_ESTADUAL = 6259;
const CARGO_PRESIDENTE = 1;
const CARGO_SENADOR = 5;
const POLL_SECONDS = 15;
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const fmtPct=v=>(v===null||v===undefined)?"—":Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%";
const fmtPP=v=>{if(v===null||v===undefined)return"—";const x=Number(v);return(x>0?"+":"")+x.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+" p.p."};
const fmtInt=v=>(v===null||v===undefined)?"—":Number(v).toLocaleString("pt-BR");
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const party=s=>s?`<span class="party">${esc(s)}</span>`:"—";
const normalize=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toUpperCase();

function asNumber(v){
  if(v===null||v===undefined||v==="")return 0;
  if(typeof v==="number")return v;
  let s=String(v).trim().replace("%","");
  if(s.includes(",")&&s.includes("."))s=s.replaceAll(".","").replace(",","."); else s=s.replace(",",".");
  const n=Number(s);return Number.isFinite(n)?n:0;
}
function resultUrl(uf,cargo,eleicao){const u=uf.toLowerCase();return `${BASE}/${eleicao}/dados/${u}/${u}-c${String(cargo).padStart(4,"0")}-e${String(eleicao).padStart(6,"0")}-u.json`;}
async function getJson(url){
  const response=await fetch(url,{cache:"no-store",headers:{"Accept":"application/json,text/plain,*/*"}});
  if(!response.ok)throw new Error(`HTTP ${response.status} — ${url}`);
  return response.json();
}
function flattenCandidates(data){
  const rows=[];
  for(const cargo of (data.carg||[]))for(const agr of (cargo.agr||[]))for(const par of (agr.par||[]))for(const cand of (par.cand||[])){
    const pct=(cand.pvapn!==null&&cand.pvapn!==undefined&&cand.pvapn!=="")?cand.pvapn:cand.pvap;
    rows.push({name:cand.nmu||cand.nm||"",full_name:cand.nm||"",party:par.sg||"",number:cand.n,votes:Math.trunc(asNumber(cand.vap)),pct:asNumber(pct),status:cand.st||""});
  }
  return rows.sort((a,b)=>(b.votes-a.votes)||(b.pct-a.pct));
}
function sectionsPct(data){
  const s=data.s||{};let p=(s.pstn!==null&&s.pstn!==undefined&&s.pstn!=="")?s.pstn:s.pst;let val=asNumber(p);
  if(!val){const total=asNumber(s.ts),done=asNumber(s.st);if(total)val=100*done/total;}return val;
}
function generationInfo(data){return {generation_date:data.dg||"",generation_time:data.hg||"",progress:sectionsPct(data),idg:data.idg??null};}
function matchCandidate(candidates,aliases){
  const a=aliases.map(normalize);for(const field of ["name","full_name"])for(const c of candidates){const n=normalize(c[field]);if(a.some(x=>n.includes(x)))return c;}return null;
}
const compact=c=>c?{name:c.name,party:c.party,votes:c.votes,pct:c.pct,status:c.status}:null;
function leaderClass(diff,side){if(diff===null||diff===undefined)return"";const x=Number(diff);if(x>0&&side==="lula")return"lead-lula";if(x<0&&side==="flavio")return"lead-flavio";return"";}
function diffClass(diff){if(diff===null||diff===undefined)return"";const x=Number(diff);return x>0?"lead-lula":x<0?"lead-flavio":"";}
function setStatus(kind,text){document.getElementById("dot").className="dot "+kind;document.getElementById("statusText").textContent=text;}
function candidateName(c){return c?esc(c.name||"—"):"—";}

async function fetchState(uf){
  const [pres,sen]=await Promise.allSettled([
    getJson(resultUrl(uf,CARGO_PRESIDENTE,ELEICAO_PRESIDENTE)),
    getJson(resultUrl(uf,CARGO_SENADOR,ELEICAO_ESTADUAL))
  ]);
  const out={uf,errors:[]};
  if(pres.status==="fulfilled"){
    const c=flattenCandidates(pres.value),lula=matchCandidate(c,["LULA"]),flavio=matchCandidate(c,["FLAVIO","FLAVIO BOLSONARO"]);
    out.president={lula:compact(lula),flavio:compact(flavio),diff:(lula&&flavio)?lula.pct-flavio.pct:null,progress:sectionsPct(pres.value)};
  }else out.errors.push(pres.reason?.message||String(pres.reason));
  if(sen.status==="fulfilled"){
    const c=flattenCandidates(sen.value);out.senate={first:compact(c[0]),second:compact(c[1]),progress:sectionsPct(sen.value)};
  }else out.errors.push(sen.reason?.message||String(sen.reason));
  return out;
}

async function loadDashboard(){
  const br=await getJson(resultUrl("br",CARGO_PRESIDENTE,ELEICAO_PRESIDENTE));
  const all=flattenCandidates(br),lula=matchCandidate(all,["LULA"]),flavio=matchCandidate(all,["FLAVIO","FLAVIO BOLSONARO"]);
  const keep=new Set([lula,flavio].filter(Boolean).map(c=>`${c.name}|${c.party}|${c.number}`));
  const president=all.filter(c=>c.pct>1||keep.has(`${c.name}|${c.party}|${c.number}`));
  const statesRaw=await Promise.all(UFS.map(fetchState));
  const states=statesRaw.map(x=>({uf:x.uf,...(x.president||{lula:null,flavio:null,diff:null,progress:null})}));
  const senate=statesRaw.map(x=>({uf:x.uf,...(x.senate||{first:null,second:null,progress:null})}));
  const errors=statesRaw.flatMap(x=>x.errors).slice(0,8);
  return {meta:generationInfo(br),president,states,senate,errors};
}

function render(data){
  setStatus("ok","TSE conectado");
  document.getElementById("progress").textContent=fmtPct(data.meta.progress);
  document.getElementById("tseTime").textContent=(data.meta.generation_time||"—")+(data.meta.generation_date?" · "+data.meta.generation_date:"");
  document.getElementById("presBody").innerHTML=data.president.map(c=>`<tr><td><strong>${candidateName(c)}</strong></td><td>${party(c.party)}</td><td class="num">${fmtInt(c.votes)}</td><td class="num"><strong>${fmtPct(c.pct)}</strong></td></tr>`).join("")||`<tr><td colspan="4" class="msg">Ainda não há votação presidencial divulgada.</td></tr>`;
  document.getElementById("stateBody").innerHTML=data.states.map(r=>`<tr><td><strong>${esc(r.uf)}</strong></td><td class="num ${leaderClass(r.diff,"lula")}">${r.lula?fmtPct(r.lula.pct):"—"}</td><td class="num ${leaderClass(r.diff,"flavio")}">${r.flavio?fmtPct(r.flavio.pct):"—"}</td><td class="num ${diffClass(r.diff)}">${fmtPP(r.diff)}</td><td class="num">${fmtPct(r.progress)}</td></tr>`).join("");
  document.getElementById("senBody").innerHTML=data.senate.map(r=>`<tr><td><strong>${esc(r.uf)}</strong></td><td>${candidateName(r.first)}</td><td>${r.first?party(r.first.party):"—"}</td><td class="num">${r.first?fmtPct(r.first.pct):"—"}</td><td>${candidateName(r.second)}</td><td>${r.second?party(r.second.party):"—"}</td><td class="num">${r.second?fmtPct(r.second.pct):"—"}</td><td class="num">${fmtPct(r.progress)}</td></tr>`).join("");
  const errors=document.getElementById("errors");if(data.errors.length){errors.style.display="block";errors.textContent="Algumas consultas não responderam: "+data.errors.slice(0,4).join(" | ");}else errors.style.display="none";
  document.getElementById("fetchTime").textContent=new Date().toLocaleTimeString("pt-BR");
}

let loading=false,remaining=POLL_SECONDS;
async function load(){
  if(loading)return;loading=true;setStatus("wait","Consultando TSE…");
  try{render(await loadDashboard());}
  catch(e){setStatus("err","Erro ao consultar TSE");const errors=document.getElementById("errors");errors.style.display="block";errors.textContent=`${e}. Se estiver abrindo pelo GitHub Pages e este erro persistir, pode haver bloqueio CORS temporário no endpoint do TSE.`;}
  finally{loading=false;remaining=POLL_SECONDS;}
}
document.getElementById("refresh").addEventListener("click",()=>{remaining=0;load();});
document.getElementById("pollLabel").textContent=POLL_SECONDS;
setInterval(()=>{remaining--;if(remaining<=0){remaining=POLL_SECONDS;load();}document.getElementById("countdown").textContent=Math.max(0,remaining)+" s";},1000);
load();
