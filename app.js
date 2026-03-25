const APP_VERSION = "pdf-v2";
const STATE_VERSION = 26;

/* Bela Mares — Checklist (v19) */
/* Sem Service Worker para evitar cache travado em testes. */

const STORAGE_KEY = "bm_checklist_classic_v1";
let localSaveDisabled = false;

// Evita quebrar o app quando o LocalStorage estoura (fotos/estado grande).
function safeSetItem(key, value){
  if(localSaveDisabled) return;
  try{
    localStorage.setItem(key, value);
  }catch(e){
    console.warn("LocalStorage cheio (quota). Cache local desativado para evitar travar o app.", e);
    localSaveDisabled = true;
    try{ localStorage.removeItem(key); }catch(_){}
  }
}

// Remove dataUrl/base64 para não estourar quota do LocalStorage.
// O dado "real" continua no Firestore (servidor).
function stripLargeFields(obj){
  if(!obj || typeof obj !== "object") return;
  if(Array.isArray(obj)){
    for(const it of obj) stripLargeFields(it);
    return;
  }
  for(const k of Object.keys(obj)){
    const v = obj[k];
    if(k === "dataUrl" && typeof v === "string"){
      obj[k] = null;
      continue;
    }
    stripLargeFields(v);
  }
}

function persistableStateForLocal(){
  const s = persistableState();
  try{ stripLargeFields(s); }catch(_){}
  return s;
}


const SESSION_KEY = "bm_checklist_session_user";
function getSessionUserId(){
  try{ return (localStorage.getItem(SESSION_KEY)||"").trim().toLowerCase(); }catch(e){ return ""; }
}
function setSessionUserId(id){
  try{ if(!id){ localStorage.removeItem(SESSION_KEY); return; }
    localStorage.setItem(SESSION_KEY, String(id).trim().toLowerCase());
  }catch(e){}
}

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

function uid(prefix="id"){
  return prefix + "_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

const APT_NUMS_12 = ["101","102","103","104","201","202","203","204","301","302","303","304"];

// --- Apartamentos virtuais (para obras novas criadas "leves") ---
function aptNumsByConfig(aptsPerBlock){
  return (Number(aptsPerBlock)===16) ? APT_NUMS_16 : APT_NUMS_12;
}
function aptNumsForBlock(obra, block){
  const keys = Object.keys(block?.apartments||{});
  if(keys.length) return keys.sort((a,b)=>Number(a)-Number(b));
  return aptNumsByConfig(obra?.config?.aptsPerBlock||16);
}
function getOrMakeApartment(obraId, blockId, aptNum){
  const obra = state.obras[obraId];
  if(!obra) return null;
  const block = obra.blocks?.[blockId];
  if(!block) return null;
  if(!block.apartments) block.apartments = {};
  const an = String(aptNum);
  if(!block.apartments[an]){
    block.apartments[an] = { num: an, pendencias: [], photos: [] };
  }
  return block.apartments[an];
}
function getApartmentView(obraId, blockId, aptNum){
  const obra = state.obras[obraId];
  const block = obra?.blocks?.[blockId];
  const an = String(aptNum);
  return (block?.apartments && block.apartments[an]) ? block.apartments[an] : { num: an, pendencias: [], photos: [] };
}

const APT_NUMS_16 = ["101","102","103","104","201","202","203","204","301","302","303","304","401","402","403","404"];

function seed(){
  const state = {
    version: 26,
    session: null, // { userId }
    users: [
      { id:"supervisor_01", name:"Supervisor 01", role:"supervisor", pin:"3333", obraIds:["*"], active:true },
      { id:"qualidade_valparaiso", name:"Qualidade Valparaíso", role:"qualidade", pin:"2222", obraIds:["*"], active:true },
      { id:"qualidade_aguaslindas", name:"Qualidade Águas Lindas", role:"qualidade", pin:"2233", obraIds:[], active:true },
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

  function makeObra(id, name, numBlocks, aptsPerBlock, city="valparaiso"){
    const blocks = {};
    for(let b=1;b<=numBlocks;b++){
      const bid = "B"+b;
      const apartments = {};
      const nums = (aptsPerBlock===12) ? APT_NUMS_12 : (aptsPerBlock===16 ? APT_NUMS_16 : APT_NUMS_12);
      nums.forEach(n=>{
        apartments[n] = { num:n, pendencias: [], photos: [] };
      });
      blocks[bid] = { id:bid, apartments };
    }
    const obra = { id, name, city, config:{ numBlocks, aptsPerBlock }, blocks };
    state.obras[id] = obra;
    state.obras_index.push({ id, name, city: obra.city, config: obra.config });
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
    createdBy: { id:"qualidade_valparaiso", name:"Qualidade Valparaíso", role:"qualidade" },
    doneAt:null, doneBy:null,
    reviewedAt:null, reviewedBy:null,
    rejection:null,
    reopenedAt:null,
      photos: []
    });

  return state;
}

function loadState(){
  // 1) localStorage (fast)  2) Firestore (if configured) will overwrite via listener
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return seed();
    const parsed = JSON.parse(raw);
    if(!parsed || !parsed.version) return seed();
    if(parsed.version !== STATE_VERSION) return seed();
    if(parsed && parsed.session) delete parsed.session;
    if(!parsed._meta) parsed._meta = {};
    return parsed;
  }catch(e){
    return seed();
  }
}
let state = loadState();
ensureSystemDefaults();

// ---- Firestore (live sync) ----
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBZuzY9l0lbgD9rf79mQ_-tbUoLWPVmN08",
  authDomain: "bela-mares-entregas.firebaseapp.com",
  projectId: "bela-mares-entregas",
  storageBucket: "bela-mares-entregas.firebasestorage.app",
  messagingSenderId: "159475494264",
  appId: "1:159475494264:web:953427de1a900f7aa3ac8d"
};


// --- Live sync sem estourar 1MiB ---
// Mantém o legado em apps/bela_mares_checklist/state/main (somente leitura).
// Novas alterações por apartamento vão para: apps/bela_mares_checklist/apartments/{obraId}__{blockId}__{apto}
const APARTMENTS_COLLECTION = "apartments";
let fbApartmentsUnsub = null;

function ensureFirebaseModules(){
  if(window.firebaseDb && window.fbFns) return true;
  const g = window;
  const appNS = g.firebaseApp;
  const dbNS  = g.firebaseFirestore;
  if(!appNS || !dbNS) return false;

  const app = appNS.getApps && appNS.getApps().length ? appNS.getApps()[0] : appNS.initializeApp(FIREBASE_CONFIG);
  const db = dbNS.getFirestore(app);

  window.firebaseDb = db;
  window.fbFns = {
    doc: dbNS.doc,
    getDoc: dbNS.getDoc,
    setDoc: dbNS.setDoc,
    updateDoc: dbNS.updateDoc,
    deleteDoc: dbNS.deleteDoc,
    collection: dbNS.collection,
    onSnapshot: dbNS.onSnapshot,
    getDocs: dbNS.getDocs,
    writeBatch: dbNS.writeBatch
  };
  return true;
}

function apartmentDocId(obraId, blockId, aptNum){
  return `${String(obraId)}__${String(blockId)}__${String(aptNum)}`;
}

async function ensureApartmentDocExists(obraId, blockId, aptNum){
  if(!ensureFirebaseModules()) return;
  const db = window.firebaseDb, f = window.fbFns;
  const ref = f.doc(db, "apps", "bela_mares_checklist", APARTMENTS_COLLECTION, apartmentDocId(obraId, blockId, aptNum));
  const snap = await f.getDoc(ref);
  if(!snap.exists()){
    const apt = getApartmentView(obraId, blockId, aptNum);
    await f.setDoc(ref, {
      obraId, blockId, aptNum: String(aptNum),
      pendencias: apt.pendencias || [],
      photos: apt.photos || [],
      updatedAt: new Date().toISOString()
    }, { merge:true });
  }
}

async function saveApartmentDoc(obraId, blockId, aptNum){
  if(!ensureFirebaseModules()) return;
  const db = window.firebaseDb, f = window.fbFns;
  const apt = getApartmentView(obraId, blockId, aptNum);
  const ref = f.doc(db, "apps", "bela_mares_checklist", APARTMENTS_COLLECTION, apartmentDocId(obraId, blockId, aptNum));
  await f.setDoc(ref, {
    obraId, blockId, aptNum: String(aptNum),
    pendencias: apt.pendencias || [],
    photos: apt.photos || [],
    updatedAt: new Date().toISOString()
  }, { merge:true });
}

async function deleteApartmentDoc(obraId, blockId, aptNum){
  if(!ensureFirebaseModules()) return;
  const db = window.firebaseDb, f = window.fbFns;
  const ref = f.doc(db, "apps", "bela_mares_checklist", APARTMENTS_COLLECTION, apartmentDocId(obraId, blockId, aptNum));
  try{ await f.deleteDoc(ref); }catch(_){}
}

async function deleteAllApartmentDocsForObra(obraId){
  if(!ensureFirebaseModules()) return;
  const obra = state.obras?.[obraId];
  const db = window.firebaseDb, f = window.fbFns;
  const batch = f.writeBatch(db);
  if(obra?.blocks){
    for(const [blockId, block] of Object.entries(obra.blocks)){
      const nums = aptNumsForBlock(obra, block);
      for(const aptNum of nums){
        const ref = f.doc(db, "apps", "bela_mares_checklist", APARTMENTS_COLLECTION, apartmentDocId(obraId, blockId, aptNum));
        batch.delete(ref);
      }
    }
  }
  try{ await batch.commit(); }catch(e){ console.warn("Falha ao apagar apartments da obra", obraId, e); }
}

function startApartmentsListener(){
  try{ if(fbApartmentsUnsub) fbApartmentsUnsub(); }catch(_){}
  if(!ensureFirebaseModules()) return;
  const db = window.firebaseDb, f = window.fbFns;
  const colRef = f.collection(db, "apps", "bela_mares_checklist", APARTMENTS_COLLECTION);
  fbApartmentsUnsub = f.onSnapshot(colRef, (snap)=>{
    let changed = false;
    snap.docChanges().forEach((chg)=>{
      const data = chg.doc.data() || {};
      const { obraId, blockId, aptNum } = data;
      if(!obraId || !blockId || !aptNum) return;

      if(chg.type === "removed"){
        const obra = state.obras?.[obraId];
        const block = obra?.blocks?.[blockId];
        if(block?.apartments && block.apartments[String(aptNum)]){
          delete block.apartments[String(aptNum)];
          changed = true;
        }
        return;
      }

      const apt = getOrMakeApartment(obraId, blockId, aptNum);
      if(!apt) return;
      const nextPend = Array.isArray(data.pendencias) ? data.pendencias : [];
      const nextPhotos = Array.isArray(data.photos) ? data.photos : [];
      if(JSON.stringify(apt.pendencias||[]) !== JSON.stringify(nextPend) ||
         JSON.stringify(apt.photos||[]) !== JSON.stringify(nextPhotos)){
        apt.pendencias = nextPend;
        apt.photos = nextPhotos;
        changed = true;
      }
    });
    if(changed){
      saveState();
      render();
    }
  }, (err)=>console.warn("apartments listener error", err));
}

let fbReady = false;
let suppressDbWrite = false;

async function initFirestore(){
  try{
    if(!ensureFirebaseModules()) {
      console.warn("Firebase SDK não encontrado. Rodando local apenas.");
      return;
    }
    const db = window.firebaseDb, f = window.fbFns;
    const ref = f.doc(db, "apps", "bela_mares_checklist", "state", "main");
    fbReady = true;

    const snap = await f.getDoc(ref);
    if(!snap.exists()){
      await f.setDoc(ref, persistableState(), { merge:true });
    }

    f.onSnapshot(ref, (docSnap)=>{
      const remote = docSnap.data();
      if(!remote || !remote.version) return;

      suppressDbWrite = true;
      const incoming = migrateState(remote);
      incoming.session = null;
      state = incoming;
      ensureSystemDefaults();
      try{
        safeSetItem(STORAGE_KEY, JSON.stringify(persistableStateForLocal()));
      }catch(_){}
      try{
        const last = getSessionUserId();
        if(last){
          const u = state.users.find(x => String(x.id).toLowerCase() === last && x.active);
          if(u){
            state.session = { userId: u.id };
            setSessionUserId(u.id);
          }else{
            setSessionUserId("");
          }
        }
      }catch(_){}
      suppressDbWrite = false;

      render();
    }, (err)=>console.warn("Firestore onSnapshot error:", err));

    startApartmentsListener();
  }catch(err){
    console.warn("Firestore indisponível. Seguindo local.", err);
  }
}


// ---------- Migrações / Defaults ----------
function migrateState(s){
  if(!s || typeof s!=="object") s = seed();

  if(!s.version) s.version = 1;
  if(!Array.isArray(s.users)) s.users = [];
  if(!s.obras || typeof s.obras!=="object") s.obras = {};
  if(!Array.isArray(s.obras_index)) s.obras_index = [];
  if(!s.last_obras_refresh) s.last_obras_refresh = new Date().toISOString();

  // v24: garantir campo city e limpar testes antigos
  Object.values(s.obras).forEach(obra=>{
    if(!obra.city) obra.city = "valparaiso";
  });
  s.obras_index = s.obras_index
    .filter(x => !["athenas","esplendore"].includes(String(x.id||"").toLowerCase()))
    .map(x => ({ ...x, city: x.city || (s.obras[x.id]?.city || "valparaiso") }));
  delete s.obras.athenas;
  delete s.obras.esplendore;
  s.users = s.users.filter(u => !["exec_athenas","exec_esplendore"].includes(String(u.id||"").toLowerCase()));

  // v25+: meta para controlar recriação limpa / tombstones
  if(!s._meta) s._meta = {};
  if(!Array.isArray(s._meta.deletedObraIds)) s._meta.deletedObraIds = [];
  if(!Array.isArray(s._meta.deletedExecIds)) s._meta.deletedExecIds = [];

  s.version = STATE_VERSION;
  return s;
}

function ensureSystemDefaults(){
  state = migrateState(state);

  // garante users fixos se não existirem
  const fixed = [
    { id:"supervisor_01", name:"Supervisor 01", role:"supervisor", pin:"3333", obraIds:["*"], active:true },
    { id:"qualidade_valparaiso", name:"Qualidade Valparaíso", role:"qualidade", pin:"2222", obraIds:["*"], active:true },
    { id:"qualidade_aguaslindas", name:"Qualidade Águas Lindas", role:"qualidade", pin:"2233", obraIds:[], active:true },
    { id:"coordenador", name:"Coordenador", role:"coordenador", pin:"7777", obraIds:["*"], active:true },
    { id:"engenheiro", name:"Engenheiro Geral", role:"engenheiro", pin:"8888", obraIds:["*"], active:true },
    { id:"diretor", name:"Diretor", role:"diretor", pin:"9999", obraIds:["*"], active:true },
  ];
  fixed.forEach(f=>{
    const i = state.users.findIndex(u=>u.id===f.id);
    if(i<0) state.users.push(f);
    else state.users[i] = { ...f, ...state.users[i], role:f.role, active:true };
  });

  // remove lixo antigo de teste
  delete state.obras.athenas;
  delete state.obras.esplendore;
  state.obras_index = (state.obras_index||[]).filter(x => !["athenas","esplendore"].includes(String(x.id||"").toLowerCase()));
  state.users = (state.users||[]).filter(u => !["exec_athenas","exec_esplendore"].includes(String(u.id||"").toLowerCase()));

  // garante city nas obras/index
  Object.values(state.obras).forEach(obra=>{
    if(!obra.city) obra.city = "valparaiso";
  });
  state.obras_index = state.obras_index.map(x => ({
    ...x,
    city: x.city || (state.obras[x.id]?.city || "valparaiso")
  }));

  // sessão local reaplicada se usuário ainda existir
  try{
    const last = getSessionUserId();
    if(last){
      const u = state.users.find(x => String(x.id).toLowerCase() === last && x.active);
      if(u){
        state.session = { userId: u.id };
      }else{
        setSessionUserId("");
      }
    }
  }catch(_){}
}

function persistableState(){
  const s = JSON.parse(JSON.stringify(state));
  if(s && s.session) delete s.session;
  return s;
}

async function saveState(){
  try{ safeSetItem(STORAGE_KEY, JSON.stringify(persistableStateForLocal())); }catch(_){}

  if(suppressDbWrite || !fbReady) return;
  try{
    if(!ensureFirebaseModules()) return;
    const db = window.firebaseDb, f = window.fbFns;
    const ref = f.doc(db, "apps", "bela_mares_checklist", "state", "main");
    await f.setDoc(ref, persistableState(), { merge:true });
  }catch(err){
    console.warn("Falha ao salvar no Firestore:", err);
  }
}

// ---------- Auth / Roles ----------
const ROLE_LABEL = {
  qualidade: "Qualidade",
  execucao: "Execução",
  supervisor: "Supervisor",
  coordenador: "Coordenador",
  engenheiro: "Engenheiro Geral",
  diretor: "Diretor"
};
function getCurrentUser(){
  if(!state.session) return null;
  return state.users.find(u=>u.id===state.session.userId) || null;
}
function logout(){
  state.session = null;
  setSessionUserId("");
  saveState();
  goto("login");
}
function canSeeObra(user, obraId){
  if(!user) return false;
  if(["supervisor","coordenador","engenheiro","diretor"].includes(user.role)) return true;
  if(user.role==="qualidade") return true;
  return (user.obraIds||[]).includes(obraId);
}
function canManageUsers(user){
  return !!user && ["supervisor"].includes(user.role);
}
function canCreateSupervisor(user){
  return !!user && ["supervisor"].includes(user.role);
}
function canManageObras(user){
  return !!user && ["supervisor","qualidade"].includes(user.role);
}
function canEditExecution(user){
  return !!user && ["execucao"].includes(user.role);
}
function canReview(user){
  return !!user && ["supervisor"].includes(user.role);
}

// ---------- Router ----------
const routes = { screen:"login", obraId:null, blockId:null, aptNum:null, tab:"pendencias", historyFilter:"all" };
function goto(screen, params={}){
  Object.assign(routes, { screen, obraId:null, blockId:null, aptNum:null, tab:"pendencias", historyFilter:"all" }, params);
  render();
}

// ---------- Derived ----------
function visibleObrasFor(user){
  const idx = [...(state.obras_index||[])];
  idx.sort((a,b)=> a.name.localeCompare(b.name, "pt-BR"));

  if(!user) return [];
  if(["supervisor","coordenador","engenheiro","diretor","qualidade"].includes(user.role)) return idx;
  return idx.filter(o => (user.obraIds||[]).includes(o.id));
}
function obraCounters(obra){
  let total=0, pend=0, feito=0, conferido=0, reprov=0;
  Object.values(obra.blocks||{}).forEach(b=>{
    Object.values(b.apartments||{}).forEach(a=>{
      total++;
      const ps = a.pendencias||[];
      const hasPend = ps.some(p=>p.state==="pendente" || p.state==="reprovado");
      const hasFeito = ps.length>0 && ps.every(p=>p.state==="feito");
      const hasConferido = ps.length===0 || ps.every(p=>p.state==="conferido");
      const hasReprov = ps.some(p=>p.state==="reprovado");
      if(hasPend) pend++;
      else if(hasFeito) feito++;
      else if(hasConferido) conferido++;
      if(hasReprov) reprov++;
    });
  });
  return { total, pend, feito, conferido, reprov };
}
function apartmentStatus(a){
  const ps = a.pendencias||[];
  if(ps.some(p=>p.state==="reprovado")) return "reprovado";
  if(ps.some(p=>p.state==="pendente")) return "pendente";
  if(ps.length>0 && ps.every(p=>p.state==="feito")) return "feito";
  return "conferido";
}
function blockCounters(block){
  let total=0, pend=0, feito=0, conferido=0, reprov=0;
  Object.values(block.apartments||{}).forEach(a=>{
    total++;
    const st = apartmentStatus(a);
    if(st==="pendente") pend++;
    if(st==="feito") feito++;
    if(st==="conferido") conferido++;
    if(st==="reprovado") reprov++;
  });
  return { total, pend, feito, conferido, reprov };
}
function allHistoryEntries(){
  const rows = [];
  Object.values(state.obras).forEach(obra=>{
    Object.values(obra.blocks||{}).forEach(block=>{
      Object.values(block.apartments||{}).forEach(apt=>{
        (apt.pendencias||[]).forEach(p=>{
          // criado
          rows.push({
            type:"Criada",
            date:p.createdAt,
            by:p.createdBy?.name || "-",
            role:p.createdBy?.role || "-",
            obra:obra.name, block:block.id, apt:apt.num,
            title:p.title, category:p.category||"", location:p.location||"",
            dur:"-"
          });
          if(p.doneAt){
            rows.push({
              type:"Feita",
              date:p.doneAt,
              by:p.doneBy?.name || "-",
              role:p.doneBy?.role || "-",
              obra:obra.name, block:block.id, apt:apt.num,
              title:p.title, category:p.category||"", location:p.location||"",
              dur: diffHM(p.createdAt, p.doneAt)
            });
          }
          if(p.reviewedAt && p.state==="conferido"){
            rows.push({
              type:"Conferida",
              date:p.reviewedAt,
              by:p.reviewedBy?.name || "-",
              role:p.reviewedBy?.role || "-",
              obra:obra.name, block:block.id, apt:apt.num,
              title:p.title, category:p.category||"", location:p.location||"",
              dur: p.doneAt ? diffHM(p.doneAt, p.reviewedAt) : "-"
            });
          }
          if(p.reviewedAt && p.state==="reprovado"){
            rows.push({
              type:"Reprovada",
              date:p.reviewedAt,
              by:p.reviewedBy?.name || "-",
              role:p.reviewedBy?.role || "-",
              obra:obra.name, block:block.id, apt:apt.num,
              title:p.title, category:p.category||"", location:p.location||"",
              dur: p.doneAt ? diffHM(p.doneAt, p.reviewedAt) : "-"
            });
          }
        });
      });
    });
  });
  rows.sort((a,b)=> new Date(b.date) - new Date(a.date));
  return rows;
}

// ---------- UI Skeleton ----------
const app = $("#app");

function topbar(title, subtitle="", rightHtml=""){
  const u = getCurrentUser();
  return `
  <div class="topbar">
    <div class="topbar__left">
      <div class="topbar__title">${title}</div>
      ${subtitle ? `<div class="topbar__sub">${subtitle}</div>` : ``}
    </div>
    <div class="topbar__right">
      ${u ? `<div class="pill pill--soft">${esc(u.name)} · ${ROLE_LABEL[u.role]||u.role}</div>` : ``}
      ${rightHtml}
    </div>
  </div>`;
}

function roleHomeLabel(u){
  if(!u) return "Entrar";
  if(u.role==="supervisor") return "Painel do Supervisor";
  if(u.role==="qualidade") return "Painel da Qualidade";
  if(u.role==="execucao") return "Painel da Execução";
  if(u.role==="coordenador") return "Visão do Coordenador";
  if(u.role==="engenheiro") return "Visão do Engenheiro Geral";
  if(u.role==="diretor") return "Visão do Diretor";
  return "Painel";
}

function render(){
  const u = getCurrentUser();
  if(!u && routes.screen!=="login"){
    goto("login");
    return;
  }

  let html = "";
  if(routes.screen==="login") html = renderLogin();
  else if(routes.screen==="home") html = renderHome(u);
  else if(routes.screen==="users") html = renderUsers(u);
  else if(routes.screen==="createObra") html = renderCreateObra(u);
  else if(routes.screen==="obra") html = renderObra(u, routes.obraId);
  else if(routes.screen==="block") html = renderBlock(u, routes.obraId, routes.blockId);
  else if(routes.screen==="apt") html = renderApartment(u, routes.obraId, routes.blockId, routes.aptNum);
  else if(routes.screen==="history") html = renderHistory(u);
  else html = renderLogin();

  app.innerHTML = html;
  bindCommon();
  if(routes.screen==="login") bindLogin();
  if(routes.screen==="users") bindUsers(u);
  if(routes.screen==="createObra") bindCreateObra(u);
  if(routes.screen==="home") bindHome(u);
  if(routes.screen==="obra") bindObra(u, routes.obraId);
  if(routes.screen==="block") bindBlock(u, routes.obraId, routes.blockId);
  if(routes.screen==="apt") bindApartment(u, routes.obraId, routes.blockId, routes.aptNum);
  if(routes.screen==="history") bindHistory(u);
}

function bindCommon(){
  $$(".js-logout").forEach(b=> b.onclick = logout);
  $$(".js-home").forEach(b=> b.onclick = ()=> goto("home"));
}

// ---------- Login ----------
function renderLogin(){
  return `
  <div class="shell shell--center">
    <div class="card login-card">
      <div class="brand">Bela Mares</div>
      <div class="h1">Checklist de Entregas</div>
      <div class="small">Entre com usuário e PIN</div>
      <div class="form">
        <label>Usuário</label>
        <input id="loginUser" placeholder="ex.: supervisor_01" autocomplete="username" />
        <label>PIN</label>
        <input id="loginPin" placeholder="4 dígitos" inputmode="numeric" maxlength="8" type="password" autocomplete="current-password" />
        <button id="btnLogin" class="btn btn--primary btn--block">Entrar</button>
      </div>
      <div class="small" style="margin-top:12px">
        Perfis: Supervisor, Qualidade, Execução, Coordenador, Engenheiro Geral e Diretor
      </div>
    </div>
  </div>`;
}
function bindLogin(){
  $("#btnLogin").onclick = ()=>{
    const user = ($("#loginUser").value||"").trim();
    const pin = ($("#loginPin").value||"").trim();
    const u = state.users.find(x => x.id === user && String(x.pin) === pin && x.active);
    if(!u){
      toast("Usuário ou PIN inválido");
      return;
    }
    state.session = { userId: u.id };
    setSessionUserId(u.id);
    saveState();
    goto("home");
  };
  $("#loginPin").addEventListener("keydown", (e)=>{
    if(e.key==="Enter") $("#btnLogin").click();
  });
  $("#loginUser").addEventListener("keydown", (e)=>{
    if(e.key==="Enter") $("#loginPin").focus();
  });
}

// ---------- Home ----------
function renderHome(u){
  const obras = visibleObrasFor(u);

  const actions = [];
  if(canManageUsers(u)) actions.push(`<button class="btn" id="btnUsers">Usuários</button>`);
  if(canManageObras(u)) actions.push(`<button class="btn btn--orange" id="btnCreateObra">+ Obra</button>`);
  actions.push(`<button class="btn" id="btnHistory">Histórico</button>`);
  actions.push(`<button class="btn js-logout">Sair</button>`);

  const listByCity = (city, title) => {
    const arr = obras.filter(o => (o.city || "valparaiso") === city);
    if(!arr.length) return "";
    return `
      <div class="city-group">
        <div class="city-line">${title}</div>
        <div class="grid grid--obra">
          ${arr.map(o=>{
            const obra = state.obras[o.id];
            const c = obra ? obraCounters(obra) : { total:0, pend:0, feito:0, conferido:0, reprov:0 };
            return `
              <button class="card obra-card js-open-obra" data-obra="${esc(o.id)}">
                <div class="obra-card__title">${esc(o.name)}</div>
                <div class="obra-card__meta">${c.total} aptos</div>
                <div class="obra-stats">
                  <span class="stat stat--pend">Pend.: ${c.pend}</span>
                  <span class="stat stat--feito">Feito: ${c.feito}</span>
                  <span class="stat stat--conf">Conf.: ${c.conferido}</span>
                  <span class="stat stat--repr">Repr.: ${c.reprov}</span>
                </div>
              </button>`;
          }).join("")}
        </div>
      </div>
    `;
  };

  return `
  <div class="shell">
    ${topbar(roleHomeLabel(u), "Selecione uma obra", actions.join(""))}
    <div class="content">
      ${listByCity("valparaiso", "Valparaíso")}
      ${listByCity("aguaslindas", "Águas Lindas")}
    </div>
  </div>`;
}
function bindHome(u){
  const btnUsers = $("#btnUsers");
  if(btnUsers) btnUsers.onclick = ()=> goto("users");
  const btnCreateObra = $("#btnCreateObra");
  if(btnCreateObra) btnCreateObra.onclick = ()=> goto("createObra");
  const btnHistory = $("#btnHistory");
  if(btnHistory) btnHistory.onclick = ()=> goto("history");

  $$(".js-open-obra").forEach(b=>{
    b.onclick = ()=>{
      const obraId = b.dataset.obra;
      goto("obra", { obraId });
    };
  });
}

// ---------- Users ----------
function renderUsers(u){
  if(!canManageUsers(u)) return renderForbidden();

  const list = state.users
    .slice()
    .sort((a,b)=> a.name.localeCompare(b.name, "pt-BR"))
    .map(x=>`
      <div class="row row--user">
        <div>
          <div class="strong">${esc(x.name)}</div>
          <div class="small">${esc(x.id)} · ${ROLE_LABEL[x.role]||x.role} · PIN: ${esc(x.pin)}</div>
        </div>
        <div class="row" style="gap:8px">
          ${x.role==="supervisor" ? `` : `<button class="btn btn--danger js-del-user" data-user="${esc(x.id)}">Excluir</button>`}
        </div>
      </div>
    `).join("");

  return `
  <div class="shell">
    ${topbar("Usuários","Gerencie logins",`
      <button class="btn js-home">Voltar</button>
      ${canCreateSupervisor(u) ? `<button class="btn btn--orange" id="btnAddSup">+ Supervisor</button>` : ``}
    `)}
    <div class="content">
      <div class="card">
        <div class="form grid2">
          <div>
            <label>Nome</label>
            <input id="newUserName" placeholder="Nome" />
          </div>
          <div>
            <label>Usuário (id)</label>
            <input id="newUserId" placeholder="usuario_id" />
          </div>
          <div>
            <label>PIN</label>
            <input id="newUserPin" placeholder="4 dígitos" maxlength="8" />
          </div>
          <div>
            <label>Perfil</label>
            <select id="newUserRole">
              <option value="execucao">Execução</option>
            </select>
          </div>
          <div style="grid-column:1/-1">
            <label>Obra vinculada (apenas execução)</label>
            <select id="newUserObra"></select>
          </div>
          <div style="grid-column:1/-1">
            <button class="btn btn--primary" id="btnCreateUser">Criar login</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="h1">Logins cadastrados</div>
        <div class="list">${list || `<div class="small">Sem usuários</div>`}</div>
      </div>
    </div>
  </div>`;
}
function bindUsers(u){
  const obraSel = $("#newUserObra");
  const obras = visibleObrasFor(u);
  obraSel.innerHTML = obras.map(o=> `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join("");

  const btnAddSup = $("#btnAddSup");
  if(btnAddSup){
    btnAddSup.onclick = ()=>{
      const name = prompt("Nome do supervisor:");
      if(!name) return;
      const id = slugify(prompt("Usuário (id):")||"");
      if(!id) return toast("Informe um id válido");
      const pin = (prompt("PIN:")||"").trim();
      if(!pin) return toast("Informe um PIN");
      if(state.users.some(x=>x.id===id)) return toast("ID de usuário já existe");
      state.users.push({ id, name, role:"supervisor", pin, obraIds:["*"], active:true });
      saveState(); render(); toast("Supervisor criado");
    };
  }

  $("#btnCreateUser").onclick = ()=>{
    const name = ($("#newUserName").value||"").trim();
    const id = slugify(($("#newUserId").value||"").trim());
    const pin = ($("#newUserPin").value||"").trim();
    const role = ($("#newUserRole").value||"").trim();
    const obraId = ($("#newUserObra").value||"").trim();

    if(!name || !id || !pin) return toast("Preencha nome, usuário e PIN");
    if(state.users.some(x=>x.id===id)) return toast("ID de usuário já existe");
    if(role!=="execucao") return toast("Só é permitido criar login de execução aqui");
    if(!state.obras[obraId]) return toast("Selecione uma obra válida");

    state.users.push({ id, name, role, pin, obraIds:[obraId], active:true });
    saveState(); render(); toast("Login criado");
  };

  $$(".js-del-user").forEach(b=>{
    b.onclick = ()=>{
      const id = b.dataset.user;
      const user = state.users.find(x=>x.id===id);
      if(!user) return;
      if(!confirm(`Excluir o login "${user.name}"?`)) return;
      state.users = state.users.filter(x=>x.id!==id);
      saveState(); render(); toast("Login excluído");
    };
  });
}

// ---------- Create Obra ----------
function renderCreateObra(u){
  if(!canManageObras(u)) return renderForbidden();
  return `
  <div class="shell">
    ${topbar("Nova obra","Cadastre uma obra e seu login de execução",`
      <button class="btn js-home">Voltar</button>
    `)}
    <div class="content">
      <div class="card">
        <div class="form grid2">
          <div>
            <label>Nome da obra</label>
            <input id="obraName" placeholder="Ex.: Park Rubi" />
          </div>
          <div>
            <label>Código/ID da obra (opcional)</label>
            <input id="obraCode" placeholder="Ex.: park_rubi" />
          </div>
          <div>
            <label>Cidade</label>
            <select id="obraCity">
              <option value="valparaiso">Valparaíso</option>
              <option value="aguaslindas">Águas Lindas</option>
            </select>
          </div>
          <div>
            <label>Nº de blocos</label>
            <input id="obraBlocks" type="number" min="1" value="1" />
          </div>
          <div>
            <label>Apartamentos por bloco</label>
            <select id="obraApts">
              <option value="12">12</option>
              <option value="16" selected>16</option>
            </select>
          </div>

          <div style="grid-column:1/-1"><hr /></div>

          <div>
            <label>Nome do login de execução</label>
            <input id="execName" placeholder="Ex.: Execução Park Rubi" />
          </div>
          <div>
            <label>Usuário do login de execução</label>
            <input id="execUser" placeholder="Ex.: exec_park_rubi" />
          </div>
          <div>
            <label>PIN do login de execução</label>
            <input id="execPin" placeholder="4 dígitos" maxlength="8" />
          </div>

          <div style="grid-column:1/-1">
            <button class="btn btn--primary" id="btnCreateObraNow">Criar obra</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
function bindCreateObra(u){
  $("#btnCreateObraNow").onclick = async ()=>{
    const name = ($("#obraName").value||"").trim();
    const rawCode = ($("#obraCode").value||"").trim();
    const city = ($("#obraCity").value||"valparaiso").trim();
    const numBlocks = Number($("#obraBlocks").value||1);
    const aptsPerBlock = Number($("#obraApts").value||16);
    const execName = ($("#execName").value||"").trim();
    const execUser = slugify(($("#execUser").value||"").trim());
    const execPin = ($("#execPin").value||"").trim();

    if(!name || !execName || !execUser || !execPin) return toast("Preencha todos os campos");
    const obraId = slugify(rawCode || name);

    // Permitir recriar do zero, desde que não exista ativo AGORA
    if(state.obras[obraId] || state.obras_index.some(x=>x.id===obraId)) return toast("ID da obra já existe");
    if(state.users.some(x=>x.id===execUser)) return toast("Usuário de execução já existe");

    const blocks = {};
    for(let i=1;i<=numBlocks;i++){
      const bid = "B"+i;
      blocks[bid] = { id:bid, apartments:{} };
    }

    state.obras[obraId] = {
      id: obraId,
      name,
      city,
      config: { numBlocks, aptsPerBlock },
      blocks
    };
    state.obras_index.push({
      id: obraId,
      name,
      city,
      config: { numBlocks, aptsPerBlock }
    });

    state.users.push({
      id: execUser,
      name: execName,
      role: "execucao",
      pin: execPin,
      obraIds: [obraId],
      active: true
    });

    // limpa tombstones caso já tenham existido antes
    state._meta.deletedObraIds = (state._meta.deletedObraIds||[]).filter(x => x !== obraId);
    state._meta.deletedExecIds = (state._meta.deletedExecIds||[]).filter(x => x !== execUser);

    await saveState();
    toast("Obra criada com sucesso");
    goto("home");
  };
}

// ---------- Obra ----------
function renderObra(u, obraId){
  const obra = state.obras[obraId];
  if(!obra || !canSeeObra(u, obraId)) return renderForbidden();

  const blocks = Object.values(obra.blocks||{})
    .sort((a,b)=> Number(String(a.id).replace(/\D/g,"")) - Number(String(b.id).replace(/\D/g,"")))
    .map(b=>{
      const c = blockCounters(b);
      return `
        <button class="card block-card js-open-block" data-block="${esc(b.id)}">
          <div class="block-card__title">${esc(b.id)}</div>
          <div class="obra-stats">
            <span class="stat stat--pend">Pend.: ${c.pend}</span>
            <span class="stat stat--feito">Feito: ${c.feito}</span>
            <span class="stat stat--conf">Conf.: ${c.conferido}</span>
            <span class="stat stat--repr">Repr.: ${c.reprov}</span>
          </div>
        </button>
      `;
    }).join("");

  const deleteBtn = canManageObras(u)
    ? `<button class="btn btn--danger" id="btnDeleteObra">Excluir obra</button>`
    : ``;

  return `
  <div class="shell">
    ${topbar(esc(obra.name), `${obra.city==="aguaslindas"?"Águas Lindas":"Valparaíso"} · ${obra.config?.numBlocks||0} blocos`, `
      <button class="btn js-home">Voltar</button>
      ${deleteBtn}
      <button class="btn js-logout">Sair</button>
    `)}
    <div class="content">
      <div class="grid grid--block">${blocks}</div>
    </div>
  </div>`;
}
function bindObra(u, obraId){
  const obra = state.obras[obraId];
  if(!obra) return;

  $$(".js-open-block").forEach(b=>{
    b.onclick = ()=> goto("block", { obraId, blockId: b.dataset.block });
  });

  const btnDelete = $("#btnDeleteObra");
  if(btnDelete){
    btnDelete.onclick = async ()=>{
      const obra = state.obras[obraId];
      if(!obra) return;

      const execUsers = state.users.filter(x => x.role==="execucao" && (x.obraIds||[]).includes(obraId));
      const execMsg = execUsers.length
        ? `\nTambém será(ão) excluído(s) o(s) login(s): ${execUsers.map(x=>x.id).join(", ")}`
        : "";

      if(!confirm(`Excluir a obra "${obra.name}"?${execMsg}\n\nEssa ação remove a obra para poder recriá-la do zero depois.`)) return;

      // tombstones temporários só para auditoria local/remota, mas NÃO bloqueiam recriação
      state._meta.deletedObraIds = Array.from(new Set([...(state._meta.deletedObraIds||[]), obraId]));
      execUsers.forEach(x=>{
        state._meta.deletedExecIds = Array.from(new Set([...(state._meta.deletedExecIds||[]), x.id]));
      });

      // apagar docs de apartments no Firestore
      try{
        await deleteAllApartmentDocsForObra(obraId);
      }catch(e){
        console.warn("Falha ao excluir apartments da obra:", e);
      }

      // apagar usuários de execução vinculados
      state.users = state.users.filter(x => !(x.role==="execucao" && (x.obraIds||[]).includes(obraId)));

      // apagar obra/index
      delete state.obras[obraId];
      state.obras_index = state.obras_index.filter(x => x.id !== obraId);
      state.last_obras_refresh = new Date().toISOString();

      await saveState();
      toast("Obra excluída");
      goto("home");
    };
  }
}

// ---------- Block ----------
function renderBlock(u, obraId, blockId){
  const obra = state.obras[obraId];
  const block = obra?.blocks?.[blockId];
  if(!obra || !block || !canSeeObra(u, obraId)) return renderForbidden();

  const nums = aptNumsForBlock(obra, block);

  const cards = nums.map(n=>{
    const a = getApartmentView(obraId, blockId, n);
    const st = apartmentStatus(a);
    const extra = st==="pendente" ? "card-apt--pend" :
                  st==="feito" ? "card-apt--feito" :
                  st==="reprovado" ? "card-apt--repr" : "card-apt--conf";
    return `
      <button class="card apt-card ${extra} js-open-apt" data-apt="${esc(n)}">
        <div class="apt-card__num">${esc(n)}</div>
        <div class="apt-card__status">${st==="pendente"?"Com pendências":st==="feito"?"Aguardando conferência":st==="reprovado"?"Reprovado":"Concluído"}</div>
      </button>
    `;
  }).join("");

  return `
  <div class="shell">
    ${topbar(`${esc(obra.name)} · ${esc(block.id)}`, "Selecione um apartamento", `
      <button class="btn" id="btnBackObra">Voltar</button>
      <button class="btn js-logout">Sair</button>
    `)}
    <div class="content">
      <div class="grid grid--apt">${cards}</div>
    </div>
  </div>`;
}
function bindBlock(u, obraId, blockId){
  const btnBack = $("#btnBackObra");
  if(btnBack) btnBack.onclick = ()=> goto("obra", { obraId });

  $$(".js-open-apt").forEach(b=>{
    b.onclick = ()=> goto("apt", { obraId, blockId, aptNum: b.dataset.apt });
  });
}

// ---------- Apartment ----------
function renderApartment(u, obraId, blockId, aptNum){
  const obra = state.obras[obraId];
  const block = obra?.blocks?.[blockId];
  const apt = getApartmentView(obraId, blockId, aptNum);
  if(!obra || !block || !apt || !canSeeObra(u, obraId)) return renderForbidden();

  const tabs = `
    <div class="tabs">
      <button class="tab ${routes.tab==="pendencias"?"is-active":""}" data-tab="pendencias">Pendências</button>
      <button class="tab ${routes.tab==="fotos"?"is-active":""}" data-tab="fotos">Fotos</button>
    </div>`;

  const body = routes.tab==="fotos"
    ? renderAptPhotos(u, obraId, blockId, aptNum, apt)
    : renderAptPendencias(u, obraId, blockId, aptNum, apt);

  return `
  <div class="shell">
    ${topbar(`${esc(obra.name)} · ${esc(block.id)} · Apto ${esc(apt.num)}`, "", `
      <button class="btn" id="btnBackBlock">Voltar</button>
      <button class="btn js-logout">Sair</button>
    `)}
    <div class="content">
      ${tabs}
      ${body}
    </div>
  </div>`;
}

function renderAptPendencias(u, obraId, blockId, aptNum, apt){
  const canCreate = u.role==="qualidade";
  const canDo = u.role==="execucao";
  const canDeleteOwn = u.role==="qualidade";
  const canSupervisorDelete = u.role==="supervisor";

  const list = (apt.pendencias||[])
    .slice()
    .sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt))
    .map(p=>{
      const badge = p.state==="pendente" ? `<span class="badge badge--pend">Pendente</span>` :
                    p.state==="feito" ? `<span class="badge badge--feito">Aguardando conferência</span>` :
                    p.state==="reprovado" ? `<span class="badge badge--repr">Reprovado</span>` :
                    `<span class="badge badge--conf">Conferido</span>`;

      const photos = (p.photos||[]).map(ph => `
        <a class="photo-thumb" href="${esc(ph.dataUrl||"#")}" target="_blank" rel="noopener">
          <img src="${esc(ph.dataUrl||"")}" alt="foto"/>
        </a>`).join("");

      let actions = "";
      if(canDo && p.state==="pendente"){
        actions += `<button class="btn btn--primary js-mark-done" data-p="${esc(p.id)}">Marcar como feito</button>`;
      }
      if(canDo && p.state==="feito"){
        actions += `<button class="btn js-undo-done" data-p="${esc(p.id)}">Desfazer feito</button>`;
      }
      if(canReview(u) && p.state==="feito"){
        actions += `
          <button class="btn btn--primary js-review-ok" data-p="${esc(p.id)}">Conferir</button>
          <button class="btn btn--danger js-review-no" data-p="${esc(p.id)}">Reprovar</button>
        `;
      }
      if(canDo && p.state==="reprovado"){
        actions += `<button class="btn btn--primary js-rework" data-p="${esc(p.id)}">Marcar retrabalho como feito</button>`;
      }
      if((canDeleteOwn && p.createdBy?.id===u.id) || canSupervisorDelete){
        actions += `<button class="btn btn--danger js-del-pend" data-p="${esc(p.id)}">Excluir</button>`;
      }

      return `
        <div class="card pend-card">
          <div class="row" style="justify-content:space-between; gap:8px; align-items:flex-start">
            <div>
              <div class="strong">${esc(p.title)}</div>
              <div class="small">${esc(p.category||"-")} · ${esc(p.location||"-")}</div>
              <div class="small">Criada por ${esc(p.createdBy?.name||"-")} em ${fmtDT(p.createdAt)}</div>
              ${p.doneAt ? `<div class="small">Feita por ${esc(p.doneBy?.name||"-")} em ${fmtDT(p.doneAt)}</div>` : ``}
              ${p.reviewedAt ? `<div class="small">${p.state==="conferido"?"Conferida":"Reprovada"} por ${esc(p.reviewedBy?.name||"-")} em ${fmtDT(p.reviewedAt)}</div>` : ``}
              ${p.rejection ? `<div class="small">Motivo: ${esc(p.rejection)}</div>` : ``}
            </div>
            ${badge}
          </div>
          ${photos ? `<div class="photo-grid" style="margin-top:12px">${photos}</div>` : ``}
          ${actions ? `<div class="row" style="gap:8px; margin-top:12px; flex-wrap:wrap">${actions}</div>` : ``}
        </div>
      `;
    }).join("");

  const form = canCreate ? `
    <div class="card">
      <div class="h1">Nova pendência</div>
      <div class="form grid2">
        <div>
          <label>Título</label>
          <input id="pendTitle" placeholder="Ex.: Porta riscada" />
        </div>
        <div>
          <label>Categoria</label>
          <input id="pendCategory" placeholder="Ex.: Esquadria" />
        </div>
        <div style="grid-column:1/-1">
          <label>Local</label>
          <input id="pendLocation" placeholder="Ex.: Quarto 02" />
        </div>
        <div style="grid-column:1/-1">
          <label>Fotos</label>
          <input id="pendPhotos" type="file" accept="image/*" multiple />
        </div>
        <div style="grid-column:1/-1">
          <button class="btn btn--primary" id="btnAddPend">Adicionar pendência</button>
        </div>
      </div>
    </div>` : ``;

  return `
    ${form}
    <div class="stack" style="margin-top:16px">${list || `<div class="card"><div class="small">Sem pendências</div></div>`}</div>
  `;
}

function renderAptPhotos(u, obraId, blockId, aptNum, apt){
  const canUpload = u.role==="qualidade";
  const photos = (apt.photos||[])
    .slice()
    .sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt))
    .map(ph=>`
      <div class="card">
        <a class="photo-thumb photo-thumb--big" href="${esc(ph.dataUrl||"#")}" target="_blank" rel="noopener">
          <img src="${esc(ph.dataUrl||"")}" alt="foto apartamento"/>
        </a>
        <div class="small" style="margin-top:8px">${fmtDT(ph.createdAt)} · ${esc(ph.createdBy?.name||"-")}</div>
        ${u.role==="qualidade" || u.role==="supervisor"
          ? `<div class="row" style="margin-top:8px"><button class="btn btn--danger js-del-apt-photo" data-ph="${esc(ph.id)}">Excluir</button></div>`
          : ``}
      </div>
    `).join("");

  return `
    ${canUpload ? `
      <div class="card">
        <div class="h1">Adicionar foto do apartamento</div>
        <div class="form">
          <input id="aptPhotos" type="file" accept="image/*" multiple />
          <button class="btn btn--primary" id="btnAddAptPhotos">Enviar fotos</button>
        </div>
      </div>
    ` : ``}
    <div class="stack" style="margin-top:16px">${photos || `<div class="card"><div class="small">Sem fotos</div></div>`}</div>
  `;
}

function bindApartment(u, obraId, blockId, aptNum){
  const btnBack = $("#btnBackBlock");
  if(btnBack) btnBack.onclick = ()=> goto("block", { obraId, blockId });

  $$(".tab").forEach(t=>{
    t.onclick = ()=> {
      routes.tab = t.dataset.tab;
      render();
    };
  });

  const apt = getOrMakeApartment(obraId, blockId, aptNum);
  if(!apt) return;

  const btnAddPend = $("#btnAddPend");
  if(btnAddPend){
    btnAddPend.onclick = async ()=>{
      const title = ($("#pendTitle").value||"").trim();
      const category = ($("#pendCategory").value||"").trim();
      const location = ($("#pendLocation").value||"").trim();
      const files = Array.from($("#pendPhotos").files||[]);
      if(!title) return toast("Informe o título");

      const photos = [];
      for(const f of files){
        try{
          const dataUrl = await readImageAsDataURL(f);
          photos.push({
            id: uid("ph"),
            name: f.name,
            dataUrl,
            createdAt: new Date().toISOString(),
            createdBy: { id:u.id, name:u.name, role:u.role }
          });
        }catch(e){
          console.warn(e);
        }
      }

      apt.pendencias.push({
        id: uid("p"),
        title,
        category,
        location,
        state: "pendente",
        createdAt: new Date().toISOString(),
        createdBy: { id:u.id, name:u.name, role:u.role },
        doneAt: null,
        doneBy: null,
        reviewedAt: null,
        reviewedBy: null,
        rejection: null,
        reopenedAt: null,
        photos
      });
      await saveApartmentDoc(obraId, blockId, aptNum);
      await saveState();
      render();
      toast("Pendência adicionada");
    };
  }

  const btnAddAptPhotos = $("#btnAddAptPhotos");
  if(btnAddAptPhotos){
    btnAddAptPhotos.onclick = async ()=>{
      const files = Array.from($("#aptPhotos").files||[]);
      if(!files.length) return toast("Selecione ao menos uma foto");
      for(const f of files){
        try{
          const dataUrl = await readImageAsDataURL(f);
          apt.photos.push({
            id: uid("aph"),
            name: f.name,
            dataUrl,
            createdAt: new Date().toISOString(),
            createdBy: { id:u.id, name:u.name, role:u.role }
          });
        }catch(e){
          console.warn(e);
        }
      }
      await saveApartmentDoc(obraId, blockId, aptNum);
      await saveState();
      render();
      toast("Fotos enviadas");
    };
  }

  $$(".js-del-apt-photo").forEach(b=>{
    b.onclick = async ()=>{
      const phId = b.dataset.ph;
      if(!confirm("Excluir esta foto?")) return;
      apt.photos = (apt.photos||[]).filter(x=>x.id!==phId);
      await saveApartmentDoc(obraId, blockId, aptNum);
      await saveState();
      render();
      toast("Foto excluída");
    };
  });

  $$(".js-mark-done").forEach(b=>{
    b.onclick = async ()=>{
      const p = (apt.pendencias||[]).find(x=>x.id===b.dataset.p);
      if(!p) return;
      p.state = "feito";
      p.doneAt = new Date().toISOString();
      p.doneBy = { id:u.id, name:u.name, role:u.role };
      await saveApartmentDoc(obraId, blockId, aptNum);
      await saveState();
      render();
      toast("Marcado como feito");
    };
  });

  $$(".js-undo-done").forEach(b=>{
    b.onclick = async ()=>{
      const p = (apt.pendencias||[]).find(x=>x.id===b.dataset.p);
      if(!p) return;
      p.state = "pendente";
      p.doneAt = null;
      p.doneBy = null;
      p.reviewedAt = null;
      p.reviewedBy = null;
      p.rejection = null;
      await saveApartmentDoc(obraId, blockId, aptNum);
      await saveState();
      render();
      toast("Feito desfeito");
    };
  });

  $$(".js-review-ok").forEach(b=>{
    b.onclick = async ()=>{
      const p = (apt.pendencias||[]).find(x=>x.id===b.dataset.p);
      if(!p) return;
      p.state = "conferido";
      p.reviewedAt = new Date().toISOString();
      p.reviewedBy = { id:u.id, name:u.name, role:u.role };
      p.rejection = null;
      await saveApartmentDoc(obraId, blockId, aptNum);
      await saveState();
      render();
      toast("Pendência conferida");
    };
  });

  $$(".js-review-no").forEach(b=>{
    b.onclick = async ()=>{
      const p = (apt.pendencias||[]).find(x=>x.id===b.dataset.p);
      if(!p) return;
      const reason = prompt("Motivo da reprovação:") || "";
      p.state = "reprovado";
      p.reviewedAt = new Date().toISOString();
      p.reviewedBy = { id:u.id, name:u.name, role:u.role };
      p.rejection = reason.trim();
      p.reopenedAt = new Date().toISOString();
      await saveApartmentDoc(obraId, blockId, aptNum);
      await saveState();
      render();
      toast("Pendência reprovada");
    };
  });

  $$(".js-rework").forEach(b=>{
    b.onclick = async ()=>{
      const p = (apt.pendencias||[]).find(x=>x.id===b.dataset.p);
      if(!p) return;
      p.state = "feito";
      p.doneAt = new Date().toISOString();
      p.doneBy = { id:u.id, name:u.name, role:u.role };
      p.reviewedAt = null;
      p.reviewedBy = null;
      p.rejection = null;
      await saveApartmentDoc(obraId, blockId, aptNum);
      await saveState();
      render();
      toast("Retrabalho marcado como feito");
    };
  });

  $$(".js-del-pend").forEach(b=>{
    b.onclick = async ()=>{
      const p = (apt.pendencias||[]).find(x=>x.id===b.dataset.p);
      if(!p) return;
      if(!(u.role==="supervisor" || (u.role==="qualidade" && p.createdBy?.id===u.id))) {
        return toast("Você não pode excluir esta pendência");
      }
      if(!confirm("Excluir esta pendência?")) return;
      apt.pendencias = (apt.pendencias||[]).filter(x=>x.id!==p.id);
      await saveApartmentDoc(obraId, blockId, aptNum);
      await saveState();
      render();
      toast("Pendência excluída");
    };
  });
}

// ---------- History ----------
function renderHistory(u){
  const rows = allHistoryEntries();
  const filter = routes.historyFilter || "all";
  const filtered = filter==="all" ? rows : rows.filter(r => slugify(r.type) === slugify(filter));

  return `
  <div class="shell">
    ${topbar("Histórico geral","Ações realizadas no app",`
      <button class="btn js-home">Voltar</button>
      <button class="btn js-logout">Sair</button>
    `)}
    <div class="content">
      <div class="card">
        <div class="row" style="gap:8px; flex-wrap:wrap">
          <button class="btn ${filter==="all"?"btn--primary":""} js-hf" data-f="all">Todos</button>
          <button class="btn ${filter==="Criada"?"btn--primary":""} js-hf" data-f="Criada">Criadas</button>
          <button class="btn ${filter==="Feita"?"btn--primary":""} js-hf" data-f="Feita">Feitas</button>
          <button class="btn ${filter==="Conferida"?"btn--primary":""} js-hf" data-f="Conferida">Conferidas</button>
          <button class="btn ${filter==="Reprovada"?"btn--primary":""} js-hf" data-f="Reprovada">Reprovadas</button>
        </div>
      </div>

      <div class="card" style="margin-top:16px; overflow:auto">
        <table class="table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Data</th>
              <th>Usuário</th>
              <th>Perfil</th>
              <th>Obra</th>
              <th>Bloco</th>
              <th>Apto</th>
              <th>Título</th>
              <th>Categoria</th>
              <th>Local</th>
              <th>Duração</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(r=>`
              <tr>
                <td>${esc(r.type)}</td>
                <td>${fmtDT(r.date)}</td>
                <td>${esc(r.by)}</td>
                <td>${esc(ROLE_LABEL[r.role]||r.role)}</td>
                <td>${esc(r.obra)}</td>
                <td>${esc(r.block)}</td>
                <td>${esc(r.apt)}</td>
                <td>${esc(r.title)}</td>
                <td>${esc(r.category)}</td>
                <td>${esc(r.location)}</td>
                <td>${esc(r.dur)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}
function bindHistory(u){
  $$(".js-hf").forEach(b=>{
    b.onclick = ()=>{
      routes.historyFilter = b.dataset.f;
      render();
    };
  });
}

// ---------- Forbidden ----------
function renderForbidden(){
  return `
  <div class="shell shell--center">
    <div class="card">
      <div class="h1">Acesso não permitido</div>
      <div class="small">Você não tem permissão para acessar esta área.</div>
      <div class="row" style="margin-top:16px">
        <button class="btn js-home">Voltar</button>
      </div>
    </div>
  </div>`;
}

// ---------- Boot helpers / Theme CSS fix ----------
(function injectCssFixes(){
  const css = `
  :root{
    --bg:#0f172a;
    --bg-soft:#111827;
    --card:#182234;
    --card-2:#1f2937;
    --line:#334155;
    --text:#f8fafc;
    --muted:#cbd5e1;
    --primary:#2563eb;
    --orange:#ea580c;
    --danger:#dc2626;
    --ok:#16a34a;
    --warn:#ca8a04;
    --repr:#b91c1c;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:var(--bg);color:var(--text);font-family:Arial,Helvetica,sans-serif}
  button,input,select{font:inherit}
  .shell{max-width:1200px;margin:0 auto;padding:16px}
  .shell--center{min-height:100vh;display:grid;place-items:center}
  .content{margin-top:16px}
  .topbar{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
  .topbar__title{font-size:28px;font-weight:700}
  .topbar__sub{font-size:14px;color:var(--muted);margin-top:4px}
  .topbar__right{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .brand{font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#93c5fd}
  .h1{font-size:22px;font-weight:700;margin:8px 0}
  .small{font-size:13px;color:var(--muted)}
  .strong{font-weight:700}
  .pill{padding:8px 10px;border-radius:999px;border:1px solid var(--line)}
  .pill--soft{background:#0b1220}
  .card{
    background:var(--card);
    border:1px solid var(--line);
    border-radius:16px;
    padding:16px;
    color:var(--text);
  }
  .login-card{width:min(440px,92vw)}
  .form{display:grid;gap:10px;margin-top:12px}
  .form.grid2{grid-template-columns:repeat(2,minmax(0,1fr))}
  @media (max-width: 720px){ .form.grid2{grid-template-columns:1fr} }
  label{font-size:13px;color:var(--muted)}
  input,select{
    width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--line);
    background:#0b1220;color:var(--text);outline:none
  }
  input::placeholder{color:#94a3b8}
  .btn{
    border:1px solid var(--line);background:#0b1220;color:var(--text);
    padding:10px 14px;border-radius:12px;cursor:pointer
  }
  .btn:hover{filter:brightness(1.08)}
  .btn--block{width:100%}
  .btn--primary{background:var(--primary);border-color:#1d4ed8}
  .btn--orange{background:var(--orange);border-color:#c2410c}
  .btn--danger{background:var(--danger);border-color:#b91c1c}
  .grid{display:grid;gap:14px}
  .grid--obra{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
  .grid--block{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
  .grid--apt{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}
  .obra-card,.block-card,.apt-card{
    text-align:left;cursor:pointer;background:var(--card-2);min-height:110px
  }
  .obra-card__title,.block-card__title,.apt-card__num{font-size:20px;font-weight:700}
  .obra-card__meta,.apt-card__status{font-size:13px;color:var(--muted);margin-top:6px}
  .obra-stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  .stat{
    font-size:12px;padding:6px 8px;border-radius:999px;
    border:1px solid transparent;background:#0b1220
  }
  .stat--pend{border-color:#854d0e;background:#3f2b05}
  .stat--feito{border-color:#1d4ed8;background:#102a56}
  .stat--conf{border-color:#166534;background:#0f2a1c}
  .stat--repr{border-color:#991b1b;background:#3b0c0c}
  .badge{
    font-size:12px;padding:6px 10px;border-radius:999px;border:1px solid transparent;white-space:nowrap
  }
  .badge--pend{border-color:#854d0e;background:#3f2b05}
  .badge--feito{border-color:#1d4ed8;background:#102a56}
  .badge--conf{border-color:#166534;background:#0f2a1c}
  .badge--repr{border-color:#991b1b;background:#3b0c0c}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
  .tab{padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:#0b1220;color:var(--text);cursor:pointer}
  .tab.is-active{background:var(--primary);border-color:#1d4ed8}
  .stack{display:grid;gap:12px}
  .row{display:flex;align-items:center}
  .row--user{justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}
  .list{margin-top:12px}
  .photo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px}
  .photo-thumb{
    display:block;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:#0b1220
  }
  .photo-thumb img{display:block;width:100%;height:110px;object-fit:cover}
  .photo-thumb--big img{height:auto;max-height:420px;object-fit:contain;background:#020617}
  .table{width:100%;border-collapse:collapse}
  .table th,.table td{padding:10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:13px}
  .city-group{margin-bottom:22px}
  .city-line{
    color:#e2e8f0;
    font-size:14px;
    font-weight:700;
    letter-spacing:.06em;
    text-transform:uppercase;
    margin:0 0 12px 2px;
    padding:0;
    background:transparent !important;
    border:none !important;
    box-shadow:none !important;
  }
  .apt-card{background:#1f2937;color:#f8fafc}
  .card-apt--pend{background:#3a2a12;border-color:#8b5a1c}
  .card-apt--feito{background:#14263f;border-color:#274c7a}
  .card-apt--conf{background:#163222;border-color:#2a6b46}
  .card-apt--repr{background:#3a1616;border-color:#8b2b2b}
  #toast{
    position:fixed;left:50%;bottom:20px;transform:translateX(-50%);
    background:#020617;color:#fff;padding:12px 16px;border-radius:12px;
    border:1px solid #334155;display:none;z-index:9999
  }`;

  const style = document.createElement("style");
  style.id = "bm-style-fixes";
  style.textContent = css;
  document.head.appendChild(style);
})();

// ---------- Toast host ----------
(function ensureToast(){
  let t = document.getElementById("toast");
  if(!t){
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
})();

// ---------- Extra safety: rebuild missing obra index ----------
(function rebuildIndexIfNeeded(){
  if(!Array.isArray(state.obras_index)) state.obras_index = [];
  const ids = new Set(state.obras_index.map(x=>x.id));
  Object.values(state.obras||{}).forEach(o=>{
    if(!ids.has(o.id)){
      state.obras_index.push({
        id:o.id,
        name:o.name,
        city:o.city || "valparaiso",
        config:o.config || { numBlocks:Object.keys(o.blocks||{}).length, aptsPerBlock:16 }
      });
    }
  });
  state.obras_index = state.obras_index.filter(x=> !!state.obras[x.id]);
  state.obras_index.sort((a,b)=> a.name.localeCompare(b.name, "pt-BR"));
})();

// ---------- Cleanup session if missing ----------
(function validateSession(){
  const u = getCurrentUser();
  if(state.session && !u){
    state.session = null;
    setSessionUserId("");
    saveState();
  }
})();

// ---------- Helpers for external/manual hooks ----------
window.BM_APP = {
  getState: ()=> state,
  saveState,
  render,
  goto,
  logout
};

ensureSystemDefaults();
initFirestore();
render();
