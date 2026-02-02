window.addEventListener("error",function(ev){try{var root=document.getElementById("app");if(root){var msg=(ev&&ev.message)?ev.message:"erro";var st=(ev&&ev.error&&ev.error.stack)?String(ev.error.stack).slice(0,800):"";root.innerHTML=`<div class="card"><div class="h2">Erro</div><div class="small">${msg}</div>${st?`<pre class="small" style="white-space:pre-wrap;opacity:.8;margin-top:8px">${st}</pre>`:""}</div>`;}}catch(e){}});

/* Bela Mares — Checklist (v43) */
/* Sem Service Worker para evitar cache travado em testes. */

const STORAGE_KEY = "bm_checklist_v46_localcache";

// ===== Firebase (Realtime) =====
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBZuzY9l0lbgD9rf79mQ_-tbUoLWPVmN08",
  authDomain: "bela-mares-entregas.firebaseapp.com",
  projectId: "bela-mares-entregas",
  storageBucket: "bela-mares-entregas.firebasestorage.app",
  messagingSenderId: "159475494264",
  appId: "1:159475494264:web:953427de1a900f7aa3ac8d"
};

let fbApp = null;
let fbDb = null;
let fbUnsub = null;
const DOC_PATH = ["apps","bela_mares_checklist","state","main"]; // collection/doc/collection/doc

function firebaseReady(){
  return typeof firebase !== "undefined" && firebase && firebase.initializeApp;
}

async function initFirebase(){
  if(!firebaseReady()) return false;
  if(!fbApp){
    fbApp = firebase.initializeApp(FIREBASE_CONFIG);
    fbDb = firebase.firestore();
  }
  return true;
}

async function pullFromCloud(){
  const ok = await initFirebase();
  if(!ok) return { ok:false, msg:"Firebase não carregou." };
  const ref = fbDb.collection(DOC_PATH[0]).doc(DOC_PATH[1]).collection(DOC_PATH[2]).doc(DOC_PATH[3]);
  const snap = await ref.get();
  if(!snap.exists) return { ok:false, msg:"Ainda não existe estado na nuvem." };
  const data = snap.data();
  if(!data || !data.state) return { ok:false, msg:"Estado inválido na nuvem." };
  return { ok:true, state:data.state };
}

async function pushToCloud(newState){
  const ok = await initFirebase();
  if(!ok) return false;
  const ref = fbDb.collection(DOC_PATH[0]).doc(DOC_PATH[1]).collection(DOC_PATH[2]).doc(DOC_PATH[3]);
  await ref.set({ state:newState, updatedAt: new Date().toISOString() }, { merge:true });
  return true;
}

async function ensureCloudSeed(){
  const ok = await initFirebase();
  if(!ok) return;
  const ref = fbDb.collection(DOC_PATH[0]).doc(DOC_PATH[1]).collection(DOC_PATH[2]).doc(DOC_PATH[3]);
  const snap = await ref.get();
  if(!snap.exists){
    await ref.set({ state: seed(), updatedAt: new Date().toISOString() });
  }
}

function startRealtimeListener(){
  if(!fbDb) return;
  const ref = fbDb.collection(DOC_PATH[0]).doc(DOC_PATH[1]).collection(DOC_PATH[2]).doc(DOC_PATH[3]);
  if(fbUnsub) fbUnsub();
  fbUnsub = ref.onSnapshot((snap)=>{
    if(!snap.exists) return;
    const data = snap.data();
    if(!data || !data.state) return;
    const sess = state.session;
    state = data.state;
    state.session = sess;
    saveLocal();
    render();
  }, (err)=>{
    console.error("Realtime error", err);
  });
}
// ===============================

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const toastEl = () => $("#toast");
let toastTimer = null;
function toast(msg){
  const el = toastEl();
  if(!el) return;
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.style.display="none"; }, 2400);
}

function blockNum(id){
  const m = String(id||"").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}
function sortBlocks(a,b){

function getSortedBlockIds(obra){

function aptNum(a){
  const n = Number(String(a||"").replace(/\D/g,""));
  return isNaN(n)?0:n;
}
function sortApts(a,b){ return aptNum(a)-aptNum(b); }
  if(!obra) return [];
  // supports object map { "1": {...}, ... } or array ["1","2"] or numbers
  let ids = [];
  if(Array.isArray(obra.blocks)) ids = obra.blocks.map(String);
  else if(obra.blocks && typeof obra.blocks==="object") ids = Object.keys(obra.blocks);
  else if(Array.isArray(obra.blockIds)) ids = obra.blockIds.map(String);
  else if(obra.numBlocks) ids = Array.from({length:obra.numBlocks}, (_,i)=>String(i+1));
  return ids.sort(sortBlocks);
}
  return blockNum(a)-blockNum(b);
}

function esc(s){ return String(s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }


function slugify(input){
  try{
    return String(input||"")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"") // remove acentos
      .replace(/[^a-z0-9]+/g,"_")
      .replace(/^_+|_+$/g,"");
  }catch(e){
    return String(input||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  }
}


function fmtDT(iso){
  if(!iso) return "-";
  try{
    const d = new Date(iso);
    const pad = (n)=> String(n).padStart(2,"0");
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }catch(e){ return String(iso); }

function logEvent(p, type, u, extra={}){
  p.events = p.events || [];
  p.events.push({
    id: uid("ev"),
    type,
    at: new Date().toISOString(),
    by: u ? { id:u.id, name:u.name, role:u.role } : null,
    extra
  });
}

}
function diffHM(aIso,bIso){
  if(!aIso||!bIso) return "-";
  try{
    const a=new Date(aIso).getTime(), b=new Date(bIso).getTime();
    const m=Math.max(0, Math.round((b-a)/60000));
    const h=Math.floor(m/60), mm=m%60;
    return `${h}h${String(mm).padStart(2,"0")}`;
  }catch(e){ return "-"; }
}
function readImageAsDataURL(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(String(r.result||""));
    r.onerror=()=>reject(r.error||new Error("Falha ao ler imagem"));
    r.readAsDataURL(file);
  });
}

async function compressImage(file, maxSize=1280, quality=0.78){
  const blobUrl = URL.createObjectURL(file);
  try{
    const img = await new Promise((res, rej)=>{
      const im = new Image();
      im.onload = ()=>res(im);
      im.onerror = rej;
      im.src = blobUrl;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSize / Math.max(w,h));
    const cw = Math.max(1, Math.round(w*scale));
    const ch = Math.max(1, Math.round(h*scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, cw, ch);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}


function uid(prefix="id"){
  return prefix + "_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

const APT_NUMS_12 = ["101","102","103","104","201","202","203","204","301","302","303","304"];
const APT_NUMS_16 = ["101","102","103","104","201","202","203","204","301","302","303","304","401","402","403","404"];

function seed(){
  const state = {
    version: 46,
    session: null, // { userId }
    users: [
      { id:"supervisor_01", name:"Supervisor 01", role:"supervisor", pin:"3333", obraIds:["*"], active:true },
      { id:"qualidade_01", name:"Qualidade 01", role:"qualidade", pin:"2222", obraIds:["*"], active:true },
      { id:"exec_costa_rica", name:"Execução Costa Rica", role:"execucao", pin:"1234", obraIds:["costa_rica"], active:true },
      { id:"exec_costa_brava", name:"Execução Costa Brava", role:"execucao", pin:"5678", obraIds:["costa_brava"], active:true },
      { id:"coordenador", name:"Coordenador", role:"coordenador", pin:"7777", obraIds:["*"], active:true },
      { id:"engenheiro", name:"Engenheiro Geral", role:"engenheiro", pin:"8888", obraIds:["*"], active:true },
      { id:"diretor", name:"Diretor", role:"diretor", pin:"9999", obraIds:["*"], active:true },
    ],
    obras: {},
    obras_index: [],
    last_obras_refresh: new Date().toISOString()
  };

  
function blockNum(id){
  var m = String(id||"").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}
function sortBlocks(a,b){ return blockNum(a)-blockNum(b); }

function getSortedBlockIds(obra){
  if(!obra) return [];
  var ids = [];
  if(obra.blocks && typeof obra.blocks==="object" && !Array.isArray(obra.blocks)){
    ids = Object.keys(obra.blocks).map(String);
  }else if(Array.isArray(obra.blocks)){
    ids = obra.blocks.map(String);
  }else{
    var n = (obra.config && typeof obra.config.numBlocks==="number") ? obra.config.numBlocks :
            (typeof obra.numBlocks==="number" ? obra.numBlocks : 0);
    if(n>0){
      ids = Array.from({length:n}, function(_,i){ return String(i+1); });
    }
  }
  return ids.sort(sortBlocks);
}
// compat alias (typos from older builds)
var getSortedBlocklds = getSortedBlockIds;

function makeObra(id, name, numBlocks, aptsPerBlock){
    const blocks = getSortedBlockIds(obra);
    for(let b=1;b<=numBlocks;b++){
      const bid = "B"+b;
      const apartments = {};
      const nums = (aptsPerBlock===12) ? APT_NUMS_12 : (aptsPerBlock===16 ? APT_NUMS_16 : APT_NUMS_12); // (se você quiser 16 depois, a gente coloca)
      nums.forEach(n=>{
        apartments[n] = { num:n, pendencias: [], photos: [] };
      });
      blocks[bid] = { id:bid, apartments };
    }
    const obra = { id, name, config:{ numBlocks, aptsPerBlock }, blocks };
    state.obras[id] = obra;
    state.obras_index.push({ id, name, config: obra.config });
  }

  makeObra("costa_rica", "Costa Rica - Entregas", 17, 12);
  makeObra("costa_brava", "Costa Brava - Entregas", 6, 12);

  // demo
  state.obras.costa_rica.blocks.B17.apartments["204"].pendencias.push({
    id: uid("p"),
    title: "Rejunte falhando",
    category: "Revestimento",
    location: "Cozinha",
    state: "pendente", // pendente|feito|conferido|reprovado
    createdAt: new Date().toISOString(),
    createdBy: { id:"qualidade_01", name:"Qualidade 01", role:"qualidade" },
    doneAt:null, doneBy:null,
    reviewedAt:null, reviewedBy:null,
    rejection:null,
    reopenedAt:null,
      photos: [],
      events: []
    });

  return state;
}

function loadLocal(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return seed();
    const parsed = JSON.parse(raw);
    if(!parsed || !parsed.version) return seed();
    if(parsed.version !== 19) return seed();
    return parsed;
  }catch(e){
    return seed();
  }
}
let state = loadLocal();

function saveLocal(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function saveState(){
  saveLocal();
  try{ await pushToCloud(state); }catch(e){}
}

function currentUser(){
  const sid = (state.session && state.session.userId) ? state.session.userId : null;
  if(!sid) return null;
  return state.users.find(u=>u.id===sid && u.active) || null;
}

function canViewOnly(u){
  return ["diretor","engenheiro","coordenador"].includes(u.role);
}
function canCreate(u){
  return ["qualidade","supervisor"].includes(u.role);
}
function canMarkDone(u){
  return u.role==="execucao";
}
function canReview(u){
  return u.role==="supervisor";
}

function canManageObras(u){
  return ["qualidade","supervisor"].includes(u.role);
}

function canManageUsers(u){
  return ["qualidade","supervisor"].includes(u.role);
}


function canModifyPend(u, p){
  if(!u || !p) return false;
  if(!(u.role==="qualidade" || u.role==="supervisor")) return false;
  return (p.createdBy && p.createdBy.id === u.id);
}
function canModifyPhoto(u, ph){
  if(!u || !ph) return false;
  if(!(u.role==="qualidade" || u.role==="supervisor")) return false;
  return (ph.addedBy && ph.addedBy.id === u.id);
}

function canResetData(u){
  return u && u.role==="supervisor";
}
function canCreateSupervisor(u){
  return u.role==="supervisor";
}
function canDeleteObra(u){
  return u.role==="supervisor";
}

function canReopen(u){
  return ["qualidade","supervisor"].includes(u.role);
}

const nav = { screen:"login", params:{} };

function goto(screen, params={}){
  nav.screen = screen;
  nav.params = params;
  render();
}

function setTopbar(){
  const u = currentUser();
  const chip = $("#userChip");
  const settingsBtn = $("#btnSettings");
  const logout = $("#btnLogout");
  const back = $("#btnBack");

  if(u){
    chip.style.display = "inline-flex";
    settingsBtn.style.display = "inline-flex";
    chip.textContent = `${u.name} • ${u.role}`;
    logout.style.display = "inline-flex";
  }else{
    settingsBtn.style.display = "none";
    chip.style.display = "none";
    logout.style.display = "none";
  }
  // back button
  const showBack = ["dash","home","obra","apto"].includes(nav.screen) && nav.screen !== "login";
  back.style.display = showBack ? "inline-flex" : "none";
  back.onclick = ()=>{
    if(nav.screen==="apto"){
      goto("obra", { obraId: nav.params.obraId, blockId: nav.params.blockId });
    }else if(nav.screen==="obra"){
      const u2 = currentUser();
      if(u2 && canViewOnly(u2)) goto("dash");
      else goto("home");
    }else if(nav.screen==="home" || nav.screen==="dash"){
      // no-op
      toast("Você já está na tela inicial.");
    }
  };

  settingsBtn.onclick = ()=>{ goto("settings"); };

  logout.onclick = ()=>{
    state.session = null;
    saveState();
    goto("login");
  };
}

function calcObraStats(obraId){
  const obra = state.obras[obraId];
  let total=0, conclu=0, aguard=0, pend=0;
  Object.values(obra.blocks).forEach(b=>{
    Object.values(b.apartments).forEach(a=>{
      total++;
      const ps = a.pendencias || [];
      const allDone = ps.length>0 && ps.every(p=>p.state==="conferido");
      const hasPend = ps.some(p=>p.state==="pendente" || p.state==="reprovado");
      const hasAguard = ps.some(p=>p.state==="feito");
      if(allDone) conclu++;
      else if(hasPend) pend++;
      else if(hasAguard) aguard++;
    });
  });
  return { total, conclu, aguard, pend };
}

function aptStatus(apto){
  const ps = apto.pendencias || [];
  const allDone = ps.length>0 && ps.every(p=>p.state==="conferido");
  const hasPend = ps.some(p=>p.state==="pendente" || p.state==="reprovado");
  const hasAguard = ps.some(p=>p.state==="feito");
  if(allDone) return { label:"Liberado", dot:"g" };
  if(hasPend) return { label:"Com pendência", dot:"r" };
  if(hasAguard) return { label:"Aguardando conferência", dot:"o" };
  return { label:"Sem pendências", dot:"" };
}

function render(){
  setTopbar();
  const root = $("#app");
  const u = currentUser();

  // first gate
  if(!u && nav.screen!=="login"){
    nav.screen="login";
    nav.params={};
  }

  if(nav.screen==="login") return renderLogin(root);
  if(nav.screen==="dash") return renderDash(root);
  if(nav.screen==="home") return renderHome(root);
  if(nav.screen==="obra") return renderObra(root);
  if(nav.screen==="apto") return renderApto(root);
  if(nav.screen==="users") return renderUsers(root);
  if(nav.screen==="settings") return renderSettings(root);

  // fallback
  nav.screen = "login";
  nav.params = {};
  return renderLogin(root);
}

function renderLogin(root){
  root.innerHTML = `
    <div class="grid2">
      </div>
          <div class="row" style="gap:8px">
            <button id="btnBackUsers" class="btn">Voltar</button>
            ${canCreateSupervisor(u) ? `<button id="btnAddSup" class="btn btn--orange">+ Supervisor</button>` : ``}
          </div>
        </div>
        <div class="hr"></div>

        <table class="table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th class="small">Perfil</th>
              <th class="small">Acesso</th>
              <th style="text-align:right">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${active.map(x=>{
              const access = (x.obraIds||[])[0]==="*" ? "Todas" : (x.obraIds||[]).join(", ");
              return `
                <tr>
                  <td><b>${esc(x.id)}</b><div class="small">${esc(x.name||"")}</div></td>
                  <td class="small">${esc(x.role)}</td>
                  <td class="small">${esc(access)}</td>
                  <td style="text-align:right; white-space:nowrap">
                    ${(u.role==="supervisor" || (u.role==="qualidade" && ["qualidade","execucao"].includes(x.role))) ? `<button class="btn" data-pin="${esc(x.id)}">Alterar PIN</button>` : `<span class="small">—</span>`}
                    ${u.role==="supervisor" && x.role!=="diretor" ? `<button class="btn btn--red" data-off="${esc(x.id)}">Desativar</button>` : ``}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>

        <div class="hr"></div>
        <div class="small">
          <b>Regras:</b> Qualidade e Supervisor podem gerenciar usuários. Somente Supervisor cria outro Supervisor e pode desativar usuários.
        </div>
      </div>

      <div class="card">
        <div class="h2">Criar login de Execução</div>
        <div class="small">1 login por obra (para usar em mais de um celular, use o mesmo usuário + PIN).</div>
        <div class="hr"></div>

        <div class="grid">
          <div>
            <div class="small">Obra</div>
            <select id="execObra" class="input">
              ${state.obras_index.map(o=>`<option value="${esc(o.id)}">${esc(o.name)}</option>`).join("")}
            </select>
          </div>
          <div class="grid" style="grid-template-columns:1fr 1fr; gap:10px">
            <div>
              <div class="small">Usuário</div>
              <input id="execUser" class="input" placeholder="Ex.: exec_costa_rica" />
            </div>
            <div>
              <div class="small">PIN (4 dígitos)</div>
              <input id="execPin" class="input" inputmode="numeric" placeholder="Ex.: 1234" />
            </div>
          </div>
          <div class="row" style="justify-content:flex-end">
            <button id="btnCreateExec" class="btn btn--orange">Criar Execução</button>
          </div>
        </div>
      </div>
    </div>
  `;

  $("#btnBackUsers").onclick = ()=>{
    const u2 = currentUser();
    goto(canViewOnly(u2) ? "dash" : "home");
  };

  $("#btnCreateExec").onclick = ()=>{
    const obraId = $("#execObra").value;
    const userId = ($("#execUser").value||"").trim();
    const pin = ($("#execPin").value||"").trim();
    if(!userId){ toast("Informe o usuário."); return; }
    if(!/^[0-9]{4}$/.test(pin)){ toast("PIN deve ter 4 dígitos."); return; }

    const exists = state.users.find(x=>x.id===userId);
    if(exists){ toast("Usuário já existe."); return; }

    const already = state.users.find(x=>x.role==="execucao" && (x.obraIds||[])[0]===obraId && x.active);
    if(already){ toast("Já existe Execução para essa obra."); return; }

    const obraName = (state.obras[obraId] && state.obras[obraId].name) ? state.obras[obraId].name : obraId;
    state.users.push({ id:userId, name:"Execução "+obraName, role:"execucao", pin, obraIds:[obraId], active:true });
    saveState();
    toast("Login Execução criado.");
    goto("users");
  };

  $$('button[data-pin]').forEach(b=>{
    b.onclick = ()=>{
      const id = b.getAttribute("data-pin");
      const newPin = prompt("Novo PIN (4 dígitos) para: "+id) || "";
      if(!/^[0-9]{4}$/.test(newPin.trim())){ toast("PIN inválido."); return; }
      const user = state.users.find(x=>x.id===id);
      if(!user) return;
      user.pin = newPin.trim();
      saveState();
      toast("PIN atualizado.");
      goto("users");
    };
  });

  $$('button[data-off]').forEach(b=>{
    b.onclick = ()=>{
      const id = b.getAttribute("data-off");
      const target = state.users.find(x=>x.id===id);
      if(!target) return;
      const ok = confirm("Desativar usuário "+id+"?");
      if(!ok) return;
      const typed = prompt("Para confirmar, digite DESATIVAR:") || "";
      if(typed.trim().toUpperCase()!=="DESATIVAR"){ toast("Cancelado."); return; }
      target.active = false;
      if(state.session && state.session.userId===id){
        state.session = null;
      }
      saveState();
      toast("Usuário desativado.");
      goto("users");
    };
  });

  const addSup = $("#btnAddSup");
  if(addSup){
    addSup.onclick = ()=>{
      const id = prompt("Usuário do novo Supervisor (ex.: supervisor_02)") || "";
      const pin = prompt("PIN (4 dígitos) do novo Supervisor:") || "";
      const uid = id.trim();
      const p = pin.trim();
      if(!uid){ toast("Usuário inválido."); return; }
      if(!/^[0-9]{4}$/.test(p)){ toast("PIN inválido."); return; }
      if(state.users.find(x=>x.id===uid)){ toast("Usuário já existe."); return; }
      state.users.push({ id: uid, name:"Supervisor", role:"supervisor", pin:p, obraIds:["*"], active:true });
      saveState();
      toast("Supervisor criado.");
      goto("users");
    };
  }
}


function renderSettings(root){
  const u = currentUser();
  if(!u) return goto("login");

  root.innerHTML = `
    <div class="grid2">
      <div class="card">
        <div class="row">
          <div>
            <div class="h1">Configurações</div>
            <div class="small">Versão do protótipo: <b>v26</b></div>
          </div>
          <div class="row" style="gap:8px">
            <button id="btnBackSettings" class="btn">Voltar</button>
          </div>
        </div>

        <div class="hr"></div>

        <div class="small">
          <b>Atenção:</b> este protótipo ainda salva dados localmente no navegador (um passo antes do modo “ao vivo”).
        </div>

        ${canResetData(u) ? `
          <div class="hr"></div>
          <div class="h2">Área do Supervisor</div>
          <div class="small">Zerar apaga tudo deste dispositivo (obras, pendências, fotos e usuários). Use só em último caso.</div>
          <div class="hr"></div>
          <button id="btnResetAll" class="btn btn--red">Zerar tudo</button>
        ` : `
          <div class="hr"></div>
          <div class="small">Sem ações administrativas para este perfil.</div>
        `}
      </div>

      <div class="card">
        <div class="h2">Segurança</div>
        <div class="small">Regras aplicadas agora:</div>
        <div class="hr"></div>
        <div class="small">
          • Botão “Zerar tudo” não aparece para qualidade/execução/visualização.<br>
          • Para zerar, o Supervisor precisa confirmar e informar o próprio PIN.
        </div>
      </div>
    </div>
  `;

  $("#btnBackSettings").onclick = ()=>{
    const u2 = currentUser();
    if(canViewOnly(u2)) goto("dash"); else goto("home");
  };

  const btn = $("#btnResetAll");
  if(btn){
    btn.onclick = ()=>{
      const ok = confirm("ATENÇÃO: Isso apaga TUDO deste navegador/dispositivo. Deseja continuar?");
      if(!ok) return;
      const typed = prompt("Para confirmar, digite ZERAR TUDO:") || "";
      if(typed.trim().toUpperCase()!=="ZERAR TUDO"){ toast("Cancelado."); return; }
      const pin = prompt("Digite seu PIN de supervisor para confirmar:") || "";
      const sup = currentUser();
      if(!sup || sup.role!=="supervisor"){ toast("Sem permissão."); return; }
      if(pin.trim() !== sup.pin){ toast("PIN incorreto."); return; }
      state = seed();
      saveState();
      toast("Dados zerados.");
      goto("login");
    };
  }
}

// boot
(function boot(){
  (async ()=>{
    try{
      await ensureCloudSeed();
      const pulled = await pullFromCloud();
      if(pulled.ok){
        const sess = state.session;
        state = pulled.state;
        state.session = sess;
        saveLocal();
      }
      startRealtimeListener();
    }catch(e){
      console.warn("Firebase bootstrap failed (offline/local)", e);
    }

    const u = currentUser();
    if(u){
      if(u.role==="execucao") { nav.screen="obra"; nav.params={ obraId:(u.obraIds||[])[0] }; }
      else if(canViewOnly(u)) { nav.screen="dash"; nav.params={}; }
      else { nav.screen="home"; nav.params={}; }
    }else{
      nav.screen="login"; nav.params={};
    }
    render();
  })();

  // If session exists, route accordingly; else login.
  const u = currentUser();
  if(u){
    if(u.role==="execucao"){
      goto("obra", { obraId: (u.obraIds||[])[0] });
    }else if(canViewOnly(u)){
      goto("dash");
    }else{
      goto("home");
    }
  }else{
    goto("login");
  }
})();
