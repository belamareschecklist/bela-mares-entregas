const APP_VERSION = "workflow-v3";
const STATE_VERSION = 27;

/* Bela Mares — Checklist (v20) */
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
  try{
    if(!id){
      localStorage.removeItem(SESSION_KEY);
      return;
    }
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
function esc(s){
  return String(s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function slugify(input){
  try{
    return String(input||"")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
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
  }catch(e){
    return String(iso);
  }
}
function diffHM(aIso,bIso){
  if(!aIso||!bIso) return "-";
  try{
    const a=new Date(aIso).getTime(), b=new Date(bIso).getTime();
    const m=Math.max(0, Math.round((b-a)/60000));
    const h=Math.floor(m/60), mm=m%60;
    return `${h}h${String(mm).padStart(2,"0")}`;
  }catch(e){
    return "-";
  }
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
const APT_NUMS_16 = ["101","102","103","104","201","202","203","204","301","302","303","304","401","402","403","404"];

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

function seed(){
  const state = {
    version: 27,
    session: null,
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

  state.obras.costa_rica.blocks.B17.apartments["204"].pendencias.push({
    id: uid("p"),
    title: "Rejunte falhando",
    category: "Revestimento",
    location: "Cozinha",
    state: "pendente",
    createdAt: new Date().toISOString(),
    createdBy: { id:"qualidade_valparaiso", name:"Qualidade Valparaíso", role:"qualidade" },
    doneAt:null, doneBy:null,
    reviewedAt:null, reviewedBy:null,
    approvedAt:null, approvedBy:null,
    rejection:null,
    reopenedAt:null,
    photos: []
  });

  return state;
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return seed();
    const parsed = JSON.parse(raw);
    if(!parsed || !parsed.version) return seed();
    if(parsed.version !== STATE_VERSION){
      if(parsed && typeof parsed === "object"){
        parsed.version = STATE_VERSION;
        if(parsed && parsed.session) delete parsed.session;
        if(!parsed._meta) parsed._meta = {};
        return parsed;
      }
      return seed();
    }
    if(parsed && parsed.session) delete parsed.session;
    if(!parsed._meta) parsed._meta = {};
    return parsed;
  }catch(e){
    return seed();
  }
}
let state = loadState();
ensureSystemDefaults();

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBZuzY9l0lbgD9rf79mQ_-tbUoLWPVmN08",
  authDomain: "bela-mares-entregas.firebaseapp.com",
  projectId: "bela-mares-entregas",
  storageBucket: "bela-mares-entregas.firebasestorage.app",
  messagingSenderId: "159475494264",
  appId: "1:159475494264:web:953427de1a900f7aa3ac8d"
};

const APARTMENTS_COLLECTION = "apartments";
let fbApartmentsUnsub = null;

function makeAptDocId(obraId, blockId, apto){
  return `${obraId}__${blockId}__${String(apto)}`;
}

function ensureAptPath(obraId, blockId, apto){
  if(!state.obras) state.obras = {};
  if(!state.obras[obraId]) state.obras[obraId] = { id:obraId, name:obraId, blocks:{} };
  if(!state.obras[obraId].blocks) state.obras[obraId].blocks = {};
  if(!state.obras[obraId].blocks[blockId]) state.obras[obraId].blocks[blockId] = { id:blockId, name:blockId, apartments:{} };
  if(!state.obras[obraId].blocks[blockId].apartments) state.obras[obraId].blocks[blockId].apartments = {};
  if(!state.obras[obraId].blocks[blockId].apartments[String(apto)]) state.obras[obraId].blocks[blockId].apartments[String(apto)] = { pendencias:[], photos:[] };
  return state.obras[obraId].blocks[blockId].apartments[String(apto)];
}

function applyApartmentFromDoc(doc){
  try{
    if(!doc) return;
    const obraId = doc.obraId;
    const blockId = doc.blockId;
    const apto = String(doc.apto);
    if(!obraId || !blockId || !apto) return;
    const target = ensureAptPath(obraId, blockId, apto);
    target.pendencias = Array.isArray(doc.pendencias) ? doc.pendencias : (target.pendencias||[]);
    target.photos = Array.isArray(doc.photos) ? doc.photos : (target.photos||[]);
    if(!target._meta) target._meta = {};
    if(typeof doc.updatedAtMs === "number") target._meta.updatedAtMs = doc.updatedAtMs;
  }catch(e){
    console.warn("Falha ao aplicar apartment doc:", e);
  }
}

function persistableMetaState(){
  const copy = JSON.parse(JSON.stringify(persistableState()));
  if(copy && copy.obras){
    for(const oid of Object.keys(copy.obras)){
      const ob = copy.obras[oid];
      if(!ob || !ob.blocks) continue;
      for(const bid of Object.keys(ob.blocks)){
        const blk = ob.blocks[bid];
        if(blk && blk.apartments) delete blk.apartments;
      }
    }
  }
  return copy;
}

let fbApp = null;
let fbDb = null;
let fbReady = false;
let fbUnsub = null;
let fbMetaUnsub = null;
let lastRemoteTs = 0;
let isApplyingRemote = false;
let saveTimer = null;
let lastAction = null;

function normalizeCity(v){
  const s = String(v||"").trim().toLowerCase();
  if(s.includes("aguas")) return "aguaslindas";
  return "valparaiso";
}

function mergeObrasIndexLists(localList, incomingList){
  const map = new Map();
  (Array.isArray(localList) ? localList : []).forEach(item=>{
    if(item && item.id) map.set(item.id, { ...item });
  });
  (Array.isArray(incomingList) ? incomingList : []).forEach(item=>{
    if(!item || !item.id) return;
    const prev = map.get(item.id) || {};
    map.set(item.id, { ...prev, ...item, city: normalizeCity(item.city || prev.city || "valparaiso") });
  });
  return Array.from(map.values()).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id), "pt-BR"));
}

function migratePendenciaWorkflow(p){
  if(!p || typeof p !== "object") return p;
  if(!p.events) p.events = [];

  if(p.state === "aprovado") p.state = "concluido";

  if(p.state === "conferido" && p.reviewedBy && p.reviewedBy.role === "supervisor" && !p.approvedAt){
    p.approvedAt = p.reviewedAt || new Date().toISOString();
    p.approvedBy = p.reviewedBy;
    p.state = "concluido";
    p._legacyFlow = true;
  }

  if(p.state === "concluido" && !p.approvedAt){
    p.approvedAt = p.reviewedAt || p.doneAt || p.createdAt || new Date().toISOString();
    p.approvedBy = p.approvedBy || p.reviewedBy || null;
  }

  return p;
}

function normalizeAllPendencias(){
  state.obras = state.obras || {};
  for(const oid of Object.keys(state.obras)){
    const obra = state.obras[oid];
    if(!obra || !obra.blocks) continue;
    for(const bid of Object.keys(obra.blocks)){
      const block = obra.blocks[bid];
      if(!block || !block.apartments) continue;
      for(const an of Object.keys(block.apartments)){
        const apt = block.apartments[an];
        if(!apt || !Array.isArray(apt.pendencias)) continue;
        apt.pendencias.forEach(migratePendenciaWorkflow);
      }
    }
  }
}

function statusLabel(stateValue){
  if(stateValue==="pendente") return "Pendente";
  if(stateValue==="feito") return "Aguardando qualidade";
  if(stateValue==="conferido") return "Aguardando supervisor";
  if(stateValue==="concluido") return "Concluído";
  if(stateValue==="reprovado") return "Reprovado";
  return String(stateValue||"-");
}

function statusBadgeStyle(stateValue){
  if(stateValue==="pendente" || stateValue==="reprovado") return "background:#3b1114;color:#ffb4b4;border:1px solid #7f1d1d;";
  if(stateValue==="feito") return "background:#3d2a12;color:#ffd79a;border:1px solid #9a6700;";
  if(stateValue==="conferido") return "background:#102a43;color:#bfe3ff;border:1px solid #1d4ed8;";
  if(stateValue==="concluido") return "background:#0f2f1f;color:#bbf7d0;border:1px solid #15803d;";
  return "background:#1f2937;color:#e5e7eb;border:1px solid #374151;";
}

function ensureSystemDefaults(){
  state.users = (state.users||[]).filter(u => !(u && u.id==="exec_athenas" && u.role==="execucao"));

  const qOld = (state.users||[]).find(u=>u && u.id==="qualidade_01");
  const qVal = (state.users||[]).find(u=>u && u.id==="qualidade_valparaiso");
  if(qOld && !qVal){
    qOld.id = "qualidade_valparaiso";
    qOld.name = "Qualidade Valparaíso";
  }else if(qOld && qVal){
    state.users = state.users.filter(u=>u.id!=="qualidade_01");
  }
  if(!(state.users||[]).find(u=>u && u.id==="qualidade_valparaiso")){
    state.users.push({ id:"qualidade_valparaiso", name:"Qualidade Valparaíso", role:"qualidade", pin:"2222", obraIds:["*"], active:true });
  }
  if(!(state.users||[]).find(u=>u && u.id==="qualidade_aguaslindas")){
    state.users.push({ id:"qualidade_aguaslindas", name:"Qualidade Águas Lindas", role:"qualidade", pin:"2233", obraIds:[], active:true });
  }

  const legacyVal = new Set(["park_rubi","costa_brava","costa_rica","athenas"]);
  state.obras = state.obras || {};
  state.obras_index = state.obras_index || [];
  for(const oid of Object.keys(state.obras)){
    if(!state.obras[oid].city){
      state.obras[oid].city = legacyVal.has(oid) ? "valparaiso" : "valparaiso";
    }else{
      state.obras[oid].city = normalizeCity(state.obras[oid].city);
    }
  }
  state.obras_index = mergeObrasIndexLists([], state.obras_index.map(o=>{
    const city = normalizeCity((state.obras[o.id] && state.obras[o.id].city) || o.city || (legacyVal.has(o.id) ? "valparaiso" : "valparaiso"));
    return { ...o, city };
  }));
  normalizeAllPendencias();
}

function userCities(u){
  if(!u) return [];
  if(["supervisor","diretor","coordenador","engenheiro"].includes(u.role)) return ["*"];
  if(u.role==="execucao") return [];
  if(u.id==="qualidade_aguaslindas") return ["aguaslindas"];
  if(u.id==="qualidade_valparaiso" || u.id==="qualidade_01") return ["valparaiso"];
  return ["valparaiso"];
}

function canAccessObra(u, obraId){
  if(!u) return false;
  if(["supervisor","diretor","coordenador","engenheiro"].includes(u.role)) return true;
  if(u.role==="execucao") return (u.obraIds||[]).includes(obraId) || (u.obraIds||[]).includes("*");
  if(u.role==="qualidade"){
    const obra = state.obras?.[obraId];
    const city = normalizeCity(obra?.city || state.obras_index.find(x=>x.id===obraId)?.city || "valparaiso");
    const cities = userCities(u);
    return cities.includes("*") || cities.includes(city);
  }
  return false;
}

function visibleObrasForUser(u){
  const list = Array.isArray(state.obras_index) ? state.obras_index : [];
  return list.filter(o => canAccessObra(u, o.id));
}

function initFirestore(){
  try{
    if(!window.firebase || !window.firebase.initializeApp || !window.firebase.firestore) return;
    fbApp = window.firebase.apps && window.firebase.apps.length ? window.firebase.apps[0] : window.firebase.initializeApp(FIREBASE_CONFIG);
    fbDb  = window.firebase.firestore();
    fbReady = true;

    const ref = fbDb.collection("apps").doc("bela_mares_checklist").collection("state").doc("main");

    if(fbUnsub) try{ fbUnsub(); }catch(_){}

    const metaRefDoc = fbDb.collection("apps").doc("bela_mares_checklist").collection("state").doc("meta");
    if(fbMetaUnsub) try{ fbMetaUnsub(); }catch(_){}
    fbMetaUnsub = metaRefDoc.onSnapshot((snap)=>{
      if(!snap || !snap.exists) return;
      if(snap.metadata && snap.metadata.hasPendingWrites) return;

      const data = snap.data() || {};
      if(!data.meta) return;

      try{
        const parsed = JSON.parse(data.meta);
        if(parsed && typeof parsed === "object"){
          if(parsed.users) state.users = parsed.users;
          if(parsed.obras_index) state.obras_index = mergeObrasIndexLists(state.obras_index, parsed.obras_index);
          if(parsed.obras){
            for(const oid of Object.keys(parsed.obras||{})){
              const incoming = parsed.obras[oid];
              if(!state.obras[oid]) state.obras[oid] = incoming;
              else{
                state.obras[oid].id = incoming.id || state.obras[oid].id;
                state.obras[oid].name = incoming.name || state.obras[oid].name;
                state.obras[oid].city = incoming.city || state.obras[oid].city || "valparaiso";
                state.obras[oid].config = incoming.config || state.obras[oid].config;
                if(incoming.blocks){
                  state.obras[oid].blocks = state.obras[oid].blocks || {};
                  for(const bid of Object.keys(incoming.blocks)){
                    const inBlk = incoming.blocks[bid];
                    const curBlk = state.obras[oid].blocks[bid] || { id: bid, apartments: {} };
                    curBlk.id = inBlk.id || curBlk.id;
                    state.obras[oid].blocks[bid] = curBlk;
                  }
                }
              }
            }
          }
        }
        state.obras_index = mergeObrasIndexLists(state.obras_index, Object.values(state.obras||{}).map(ob=>({
          id: ob.id,
          name: ob.name,
          city: ob.city,
          config: ob.config
        })));
        ensureSystemDefaults();
        try{ render(); }catch(_){}
      }catch(e){
        console.warn("Meta inválido no Firestore:", e);
      }
    });

    fbUnsub = ref.onSnapshot((snap)=>{
      if(!snap || !snap.exists) return;
      if(snap.metadata && snap.metadata.hasPendingWrites) return;

      const data = snap.data() || {};
      const remoteState = data.state;
      if(!remoteState) return;

      const ts =
        (typeof data.updatedAtMs === "number" && isFinite(data.updatedAtMs)) ? data.updatedAtMs :
        (snap.updateTime && typeof snap.updateTime.toMillis === "function") ? snap.updateTime.toMillis() :
        null;

      if(!ts) return;
      if(ts <= lastRemoteTs) return;
      lastRemoteTs = ts;

      try{
        const parsed = (typeof remoteState === "string") ? JSON.parse(remoteState) : remoteState;
        if(!parsed || parsed.version !== STATE_VERSION) return;

        isApplyingRemote = true;
        const currentSession = (state && state.session) ? state.session : null;
        if(parsed.session) delete parsed.session;

        const localStateBeforeRemote = state;
        const mergedState = parsed;
        mergedState.users = parsed.users || localStateBeforeRemote.users || [];
        mergedState.obras = mergedState.obras || {};
        for(const oid of Object.keys(localStateBeforeRemote.obras || {})){
          if(!mergedState.obras[oid]) mergedState.obras[oid] = localStateBeforeRemote.obras[oid];
        }
        mergedState.obras_index = mergeObrasIndexLists(parsed.obras_index, localStateBeforeRemote.obras_index);
        state = mergedState;
        if(currentSession) state.session = currentSession;

        ensureSystemDefaults();
        if(!state._meta) state._meta = {};
        state._meta.updatedAt = ts;

        safeSetItem(STORAGE_KEY, JSON.stringify(persistableStateForLocal()));
        try{ render(); }catch(_){}
      }catch(e){
        console.warn("Erro ao aplicar estado remoto:", e);
      }finally{
        isApplyingRemote = false;
      }

      try{
        const aRef = fbDb.collection("apps").doc("bela_mares_checklist").collection(APARTMENTS_COLLECTION);
        if(fbApartmentsUnsub) try{ fbApartmentsUnsub(); }catch(_){}
        fbApartmentsUnsub = aRef.onSnapshot((qs)=>{
          if(!qs) return;
          if(qs.metadata && qs.metadata.hasPendingWrites) return;
          qs.docChanges().forEach((ch)=>{
            if(ch.type==="removed") return;
            const data = ch.doc.data() || {};
            applyApartmentFromDoc(data);
          });
          try{ render(); }catch(_){}
        });
      }catch(e){
        console.warn("Falha no listener de apartments:", e);
      }
    });
  }catch(e){
    console.warn("Falha ao iniciar Firestore:", e);
  }
}

function queueSaveToFirestore(pstate){
  if(!fbReady) return;
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async ()=>{
    const now = Date.now();
    if(isApplyingRemote) return;

    try{
      ensureSystemDefaults();
      const metaRef = fbDb.collection("apps").doc("bela_mares_checklist").collection("state").doc("meta");
      const metaPayload = {
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        updatedAtMs: now,
        meta: JSON.stringify(persistableMetaState())
      };
      await metaRef.set(metaPayload, {merge:true});
      if(lastAction==='createObra') lastAction = null;
    }catch(e){
      console.error("Firestore meta save failed:", e);
      try{ if(lastAction==='createObra') toast('ERRO ao criar obra. Abra F12 > Console.'); }catch(_){}
    }

    try{
      if(nav && nav.screen==="apto" && nav.params && nav.params.obraId && nav.params.blockId && nav.params.apto){
        const obraId = nav.params.obraId;
        const blockId = nav.params.blockId;
        const apto = String(nav.params.apto);

        const apt = ensureAptPath(obraId, blockId, apto);
        const aRef = fbDb.collection("apps").doc("bela_mares_checklist").collection(APARTMENTS_COLLECTION).doc(makeAptDocId(obraId, blockId, apto));

        const aptPayload = {
          obraId,
          obraName: (state.obras && state.obras[obraId] && state.obras[obraId].name) ? state.obras[obraId].name : obraId,
          blockId,
          apto,
          pendencias: Array.isArray(apt.pendencias) ? apt.pendencias : [],
          photos: Array.isArray(apt.photos) ? apt.photos : [],
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          updatedAtMs: now
        };

        await aRef.set(aptPayload, {merge:true});
        applyApartmentFromDoc(aptPayload);
      }
    }catch(e){
      console.error("Firestore apartment save failed:", e);
      try{ toast("ERRO ao sincronizar (apto). Abra F12 > Console."); }catch(_){}
    }

    if(!state._meta) state._meta = {};
    state._meta.updatedAt = now;
    safeSetItem(STORAGE_KEY, JSON.stringify(persistableStateForLocal()));
  }, 400);
}

function persistableState(){
  const copy = JSON.parse(JSON.stringify(state));
  if(copy && copy.session) delete copy.session;
  return copy;
}

function saveState(){
  const pstate = persistableState();
  safeSetItem(STORAGE_KEY, JSON.stringify(persistableStateForLocal()));
  try{ queueSaveToFirestore(pstate); }catch(_){}
}

function safeName(obj){
  return (obj && obj.name) ? obj.name : "-";
}
function safeRole(obj){
  return (obj && obj.role) ? obj.role : "-";
}
function ensureEvents(p){
  if(!p.events) p.events = [];
  return p.events;
}
function pushEvent(p, type, u, extra){
  const ev = Object.assign({
    type,
    at: new Date().toISOString(),
    by: u ? { id:u.id, name:u.name, role:u.role } : null
  }, extra||{});
  ensureEvents(p).push(ev);
}
function fmtEvent(ev){
  const who = ev.by ? (safeName(ev.by) + " (" + safeRole(ev.by) + ")") : "-";
  const at = fmtDT(ev.at);
  if(ev.type==="criado") return `Criado: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="editado") return `Editado: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="apagado") return `Apagado: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="feito") return `Feito: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="desfeito") return `Desfeito: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="conferido") return `Conferido pela qualidade: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="aprovado") return `Aprovado pelo supervisor: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="reprovado") return `Reprovado: <b>${at}</b> por <b>${esc(who)}</b>${ev.note?(" — "+esc(ev.note)):""}`;
  if(ev.type==="reaberto") return `Reaberto: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="foto_add") return `Foto adicionada: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="foto_del") return `Foto apagada: <b>${at}</b> por <b>${esc(who)}</b>`;
  return `<b>${esc(ev.type)}</b> — ${at} — ${esc(who)}`;
}

function currentUser(){
  const sid = getSessionUserId();
  if(!sid) return null;
  return state.users.find(u=>String(u.id).toLowerCase()===sid && u.active) || null;
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
function canQualityReview(u){
  return u.role==="qualidade";
}
function canSupervisorApprove(u){
  return u.role==="supervisor";
}
function canManageObras(u){
  return ["qualidade","supervisor"].includes(u.role);
}
function canManageUsers(u){
  return ["qualidade","supervisor"].includes(u.role);
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
    if(chip){
      chip.style.display = "inline-flex";
      chip.textContent = `${u.name} • ${u.role}`;
    }
    if(settingsBtn) settingsBtn.style.display = "inline-flex";
    if(logout) logout.style.display = "inline-flex";
    if(back) back.style.display = (nav.screen==="home" || nav.screen==="dash") ? "none" : "inline-flex";
  }else{
    if(chip) chip.style.display = "none";
    if(settingsBtn) settingsBtn.style.display = "none";
    if(logout) logout.style.display = "none";
    if(back) back.style.display = "none";
  }

  if(logout){
    logout.onclick = ()=>{
      setSessionUserId("");
      goto("login");
    };
  }

  if(back){
    back.onclick = ()=>{
      const u = currentUser();
      if(!u) return goto("login");
      if(nav.screen==="apto"){
        if(nav.params.apto) return goto("apto", { obraId: nav.params.obraId, blockId: nav.params.blockId });
        return goto("obra", { obraId: nav.params.obraId });
      }
      if(nav.screen==="obra") return goto(canViewOnly(u) ? "dash" : "home");
      if(nav.screen==="users") return goto(canViewOnly(u) ? "dash" : "home");
      if(nav.screen==="settings") return goto(canViewOnly(u) ? "dash" : "home");
      if(nav.screen==="dash") return goto("home");
      goto("home");
    };
  }

  if(settingsBtn){
    settingsBtn.onclick = ()=>{
      const u = currentUser();
      if(!u || !canResetData(u)) return;
      goto("settings");
    };
  }
}

function sortAptNums(nums){
  return [...nums].sort((a,b)=>Number(a)-Number(b));
}
function aptStatusClass(obraId, blockId, an){
  const a = getApartmentView(obraId, blockId, an);
  const ps = a.pendencias||[];
  if(!ps.length) return "";
  let hasPend=false, hasDoneExec=false, hasConferido=false;
  ps.forEach(p=>{
    if(p.state==="pendente" || p.state==="reprovado") hasPend=true;
    else if(p.state==="feito") hasDoneExec=true;
    else if(p.state==="conferido") hasConferido=true;
  });
  if(hasPend) return "dot dot--r";
  if(hasDoneExec) return "dot dot--o";
  if(hasConferido) return "dot dot--b";
  return "dot dot--g";
}

function blockDots(obraId, block){
  const obra = state.obras[obraId];
  const nums = aptNumsForBlock(obra, block);
  const apts = nums.map(an=>getApartmentView(obraId, block.id, an));
  let done=0, wait=0, conf=0, pend=0;
  apts.forEach(a=>{
    const ps = a.pendencias||[];
    if(ps.length===0) return;
    let hasPend=false, hasWait=false, hasConf=false;
    ps.forEach(p=>{
      if(p.state==="pendente" || p.state==="reprovado") hasPend=true;
      else if(p.state==="feito") hasWait=true;
      else if(p.state==="conferido") hasConf=true;
    });
    if(hasPend) pend++;
    else if(hasWait) wait++;
    else if(hasConf) conf++;
    else done++;
  });

  return `
    <span class="badge"><span class="dot dot--g"></span> ${done}</span>
    <span class="badge"><span class="dot dot--b"></span> ${conf}</span>
    <span class="badge"><span class="dot dot--o"></span> ${wait}</span>
    <span class="badge"><span class="dot dot--r"></span> ${pend}</span>
  `;
}

function calcObraStats(obraId){
  const obra = state.obras[obraId];
  if(!obra) return { total:0, semVistoria:0, conclu:0, aguard:0, pend:0 };
  let total=0, semVistoria=0, conclu=0, aguard=0, pend=0;

  Object.values(obra.blocks).forEach(b=>{
    const nums = aptNumsForBlock(obra, b);
    nums.forEach(an=>{
      const a = getApartmentView(obraId, b.id, an);
      total++;
      const ps = a.pendencias||[];
      if(ps.length===0){
        semVistoria++;
        return;
      }

      let hasPend=false, hasWait=false, hasConf=false;
      ps.forEach(p=>{
        if(p.state==="pendente" || p.state==="reprovado") hasPend=true;
        else if(p.state==="feito") hasWait=true;
        else if(p.state==="conferido") hasConf=true;
      });

      if(hasPend) pend++;
      else if(hasWait || hasConf) aguard++;
      else conclu++;
    });
  });
  return { total, semVistoria, conclu, aguard, pend };
}

function ensureRuntimeStyles(){
  if(document.getElementById("bm-runtime-styles")) return;
  const st = document.createElement("style");
  st.id = "bm-runtime-styles";
  st.textContent = `
    .dot--b{ background:#2563eb !important; }
    .apt--conf{ background:rgba(37,99,235,.14) !important; border-color:#2563eb !important; color:#dbeafe !important; }
  `;
  document.head.appendChild(st);
}

function openModal(html){
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = html;
  document.body.appendChild(backdrop);
  return {
    backdrop,
    close(){ backdrop.remove(); }
  };
}

function render(){
  ensureRuntimeStyles();
  setTopbar();
  const root = $("#app");
  const u = currentUser();

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

  nav.screen = "login";
  nav.params = {};
  return renderLogin(root);
}

function renderLogin(root){
  root.innerHTML = `
    <div class="grid2">
      <div class="card">
        <div class="h1">Entrar</div>
        <div class="small">Usuário + PIN</div>
        <div class="hr"></div>

        <div class="grid">
          <div>
            <div class="small">Usuário</div>
            <input id="loginUser" class="input" placeholder="Ex.: supervisor_01" />
          </div>
          <div>
            <div class="small">PIN</div>
            <input id="loginPin" class="input" inputmode="numeric" maxlength="4" placeholder="Ex.: 3333" />
          </div>
          <div class="row" style="justify-content:flex-end">
            <button id="btnEntrar" class="btn btn--orange">Entrar</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="h2">Perfis</div>
        <div class="small">Sistema de Pendências de Obra</div>
        <div class="hr"></div>
        <div class="small">
          <b>Qualidade</b>: cria pendências, confere o feito e pode reabrir.<br><br>
          <b>Execução</b>: marca como feito.<br><br>
          <b>Supervisor</b>: só aprova após a conferência da Qualidade.<br><br>
          <b>Diretor / Engenheiro / Coordenador</b>: somente visualização.
        </div>
      </div>
    </div>
  `;

  $("#btnEntrar").onclick = ()=>{
    const user = ($("#loginUser").value||"").trim().toLowerCase();
    const pin  = ($("#loginPin").value||"").trim();
    const found = state.users.find(u=>u.id===user && u.pin===pin && u.active);
    if(!found) return toast("Usuário/PIN inválido.");
    setSessionUserId(found.id);
    if(canViewOnly(found)) return goto("dash");
    goto("home");
  };
}

function renderDash(root){
  const u = currentUser();
  if(!u) return goto("login");
  if(!canViewOnly(u)) return goto("home");

  const stats = visibleObrasForUser(u).map(o=>{
    const s = calcObraStats(o.id);
    return { id:o.id, name:o.name, ...s };
  });
  const total = stats.reduce((a,s)=>({ total:a.total+s.total, semVistoria:a.semVistoria+s.semVistoria, conclu:a.conclu+s.conclu, aguard:a.aguard+s.aguard, pend:a.pend+s.pend }), {total:0, semVistoria:0, conclu:0, aguard:0, pend:0});

  root.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="h1">Visão Geral</div>
          <div class="small">Somatório de todas as obras</div>
        </div>
        <div class="row" style="gap:8px">
          ${canManageUsers(u) ? `<button id="btnUsersDash" class="btn">Usuários</button>` : ``}
        </div>
      </div>
      <div class="hr"></div>

      <div class="kpis">
        <div class="kpi">
          <div class="kpi__v">${total.total}</div>
          <div class="kpi__l">Qtd aptos</div>
        </div>
        <div class="kpi">
          <div class="kpi__v">${total.semVistoria}</div>
          <div class="kpi__l">Sem vistoria</div>
        </div>
        <div class="kpi">
          <div class="kpi__v">${total.pend}</div>
          <div class="kpi__l">Com pendência</div>
        </div>
        <div class="kpi">
          <div class="kpi__v">${total.aguard}</div>
          <div class="kpi__l">Aguardando conferência</div>
        </div>
        <div class="kpi">
          <div class="kpi__v">${total.conclu}</div>
          <div class="kpi__l">Concluídos</div>
        </div>
      </div>

      <div class="hr"></div>

      <table class="table">
        <thead>
          <tr>
            <th>Obra</th>
            <th class="small" style="text-align:center">Qtd aptos</th>
            <th class="small" style="text-align:center">Sem vistoria</th>
            <th class="small" style="text-align:center">Com pendência</th>
            <th class="small" style="text-align:center">Aguardando</th>
            <th class="small" style="text-align:center">Concluídos</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${stats.map(s=>`
            <tr>
              <td><b>${esc(s.name)}</b></td>
              <td style="text-align:center"><b>${s.total}</b></td>
              <td style="text-align:center"><b>${s.semVistoria}</b></td>
              <td style="text-align:center"><b>${s.pend}</b></td>
              <td style="text-align:center"><b>${s.aguard}</b></td>
              <td style="text-align:center"><b>${s.conclu}</b></td>
              <td style="text-align:right"><button class="btn" data-open="${esc(s.id)}">Abrir</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  $$('button[data-open]').forEach(b=>{
    b.onclick=()=>goto("obra",{ obraId: b.getAttribute("data-open") });
  });

  const btnUsersDash = $("#btnUsersDash");
  if(btnUsersDash) btnUsersDash.onclick = ()=> goto("users");
}

function renderHome(root){
  const u = currentUser();
  if(!u) return goto("login");
  if(canViewOnly(u)) return goto("dash");

  const obrasVisiveis = visibleObrasForUser(u);
  const valparaiso = obrasVisiveis.filter(o => normalizeCity(o.city||"valparaiso")==="valparaiso");
  const aguaslindas = obrasVisiveis.filter(o => normalizeCity(o.city||"valparaiso")==="aguaslindas");

  function renderSection(title, arr){
    if(!arr.length) return "";
    return `
      <tr>
        <td colspan="7" style="padding:0;border:none;background:transparent">
          <div style="margin:14px 0 6px;padding:12px 14px;border-radius:14px;background:linear-gradient(135deg,#0f172a,#1e293b);color:#f8fafc;display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div style="font-weight:800;letter-spacing:.3px">${title}</div>
            <div style="font-size:12px;opacity:.85">${arr.length} obra(s)</div>
          </div>
        </td>
      </tr>
      ${arr.map(o=>{
        const s = calcObraStats(o.id);
        return `
          <tr>
            <td><b>${esc(o.name)}</b><div class="small">${o.config.numBlocks} blocos • ${o.config.aptsPerBlock} apto/bloco</div></td>
            <td style="text-align:center"><b>${s.total}</b></td>
            <td style="text-align:center"><b>${s.semVistoria}</b></td>
            <td style="text-align:center"><b>${s.pend}</b></td>
            <td style="text-align:center"><b>${s.aguard}</b></td>
            <td style="text-align:center"><b>${s.conclu}</b></td>
            <td style="text-align:right"><button class="btn" data-open="${esc(o.id)}">Abrir</button> ${canDeleteObra(u) ? `<button class="btn btn--red" data-del="${esc(o.id)}">Apagar</button>` : ``}</td>
          </tr>
        `;
      }).join("")}
    `;
  }

  root.innerHTML = `
    <div class="grid2">
      <div class="card">
        <div class="row">
          <div>
            <div class="h1">Obras</div>
            <div class="small">Selecione uma obra para ver blocos e apartamentos.</div>
          </div>
          <div class="row" style="gap:8px">
            <button id="btnDash" class="btn">Visão Geral</button>
            ${canManageObras(u) ? `<button id="btnAddObra" class="btn btn--orange">+ Adicionar obra</button>` : ``}
            <button id="btnUsers" class="btn">Usuários</button>
          </div>
        </div>
        <div class="hr"></div>
        <table class="table">
          <thead>
            <tr>
              <th>Obra</th>
              <th class="small" style="text-align:center">Qtd aptos</th>
              <th class="small" style="text-align:center">Sem vistoria</th>
              <th class="small" style="text-align:center">Com pendência</th>
              <th class="small" style="text-align:center">Aguardando</th>
              <th class="small" style="text-align:center">Concluídos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${renderSection("Valparaíso", valparaiso)}
            ${renderSection("Águas Lindas", aguaslindas)}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="h2">Permissões</div>
        <div class="small">Regras principais do protótipo.</div>
        <div class="hr"></div>
        <div class="pills">
          <span class="badge"><span class="dot dot--o"></span> Feito / aguardando qualidade</span>
          <span class="badge"><span class="dot dot--b"></span> Conferido / aguardando supervisor</span>
          <span class="badge"><span class="dot dot--r"></span> Pendência</span>
          <span class="badge"><span class="dot dot--g"></span> Concluído</span>
        </div>
        <div class="hr"></div>
        <div class="small">
          <b>Qualidade / Supervisor</b>: adicionam pendências. Depois a <b>Execução</b> marca feito, a <b>Qualidade</b> confere e só então o <b>Supervisor</b> aprova ou reprova.<br><br>
          <b>Execução</b>: só marca como FEITO na obra vinculada.<br><br>
          <b>Diretor / Engenheiro / Coordenador</b>: só visualização.
        </div>
      </div>
    </div>
  `;

  $("#btnDash").onclick = ()=> goto("dash");
  const addBtn = $("#btnAddObra");
  if(addBtn){
    addBtn.onclick = ()=>{
      const u = currentUser();
      if(!canManageObras(u)) return toast("Sem permissão.");
      const { backdrop, close } = openModal(`
        <div class="modal">
          <div class="row">
            <div>
              <div class="h2">Adicionar obra</div>
            </div>
            <button class="btn btn--ghost" id="mClose">✕</button>
          </div>
          <div class="hr"></div>
          <div class="grid">
            <div>
              <div class="small">Nome da obra</div>
              <input id="mObraNome" class="input" placeholder="Ex.: Costa Azul" />
            </div>
            <div>
              <div class="small">ID da obra (opcional)</div>
              <input id="mObraId" class="input" placeholder="Ex.: costa_azul" />
            </div>
            <div>
              <div class="small">Criar login da Execução (1 por obra)</div>
              <input id="mExecUser" class="input" placeholder="Ex.: exec_costa_azul" />
            </div>
            <div>
              <div class="small">PIN da Execução</div>
              <input id="mExecPin" class="input" inputmode="numeric" maxlength="4" placeholder="Ex.: 1234" />
            </div>
            <div>
              <div class="small">Quantidade de blocos</div>
              <input id="mBlocos" class="input" inputmode="numeric" placeholder="Ex.: 6" />
            </div>
            <div>
              <div class="small">Aptos por bloco</div>
              <select id="mAptos" class="input">
                <option value="12">12</option>
                <option value="16">16</option>
              </select>
            </div>
            <div>
              <div class="small">Cidade</div>
              <select id="mCidade" class="input">
                <option value="valparaiso">Valparaíso</option>
                <option value="aguaslindas">Águas Lindas</option>
              </select>
            </div>
            <div class="row" style="justify-content:flex-end">
              <button id="mAddObra" class="btn btn--orange">Adicionar</button>
            </div>
          </div>
        </div>
      `);
      $("#mClose", backdrop).onclick = close;
      $("#mAddObra", backdrop).onclick = ()=>{
        const name = ($("#mObraNome", backdrop).value||"").trim();
        const customId = ($("#mObraId", backdrop).value||"").trim();
        const execUser = ($("#mExecUser", backdrop).value||"").trim().toLowerCase();
        const execPin = ($("#mExecPin", backdrop).value||"").trim();
        const blocks = Number(($("#mBlocos", backdrop).value||"").trim());
        const apts = Number(($("#mAptos", backdrop).value||"12").trim());
        const city = ($("#mCidade", backdrop).value||"valparaiso").trim().toLowerCase();
        if(!name) return toast("Informe o nome da obra.");
        if(!blocks || blocks < 1) return toast("Informe a quantidade de blocos.");
        const finalId = customId ? slugify(customId) : slugify(name);
        lastAction = 'createObra';
        const r = addObra(finalId, name, blocks, apts, city, execUser, execPin);
        if(!r.ok) return toast(r.msg||"Falha ao adicionar obra.");
        saveState();
        close();
        renderHome(root);
        toast("Obra criada.");
      };
    };
  }

  const usersBtn = $("#btnUsers");
  if(usersBtn) usersBtn.onclick = ()=> goto("users");

  $$('button[data-del]').forEach(btn=>{
    btn.onclick = ()=>{
      const obraId = btn.getAttribute("data-del");
      const obra = state.obras[obraId];
      const ok = confirm(`Apagar a obra "${obra?.name||obraId}"?\n\nIsso remove do app (irreversível no protótipo).`);
      if(!ok) return;
      deleteObra(obraId);
      saveState();
      renderHome(root);
      toast("Obra apagada.");
    };
  });

  $$('button[data-open]').forEach(b=>{
    b.onclick=()=>goto("obra",{ obraId: b.getAttribute("data-open") });
  });
}

function addObra(id, name, numBlocks, aptsPerBlock, city="valparaiso", execUser="", execPin=""){
  id = slugify(id||name);
  if(!id) return { ok:false, msg:"ID inválido" };
  if(state.obras[id]) return { ok:false, msg:"Já existe uma obra com esse ID" };
  const nb = Number(numBlocks||0);
  const apb = Number(aptsPerBlock||12);
  if(!nb || nb < 1) return { ok:false, msg:"Quantidade de blocos inválida" };
  const cityNorm = normalizeCity(city);

  if(execUser || execPin){
    if(!execUser || !execPin) return { ok:false, msg:"Informe usuário e PIN da Execução." };
    if(state.users.find(u=>u.id===execUser)) return { ok:false, msg:"Usuário já existe." };
    const already = state.users.find(u=>u.role==="execucao" && (u.obraIds||[])[0]===id && u.active);
    if(already) return { ok:false, msg:"Já existe Execução para essa obra." };
  }

  const blocks = {};
  for(let b=1;b<=nb;b++){
    const bid = "B"+b;
    const apartments = {};
    const nums = (apb===16) ? APT_NUMS_16 : APT_NUMS_12;
    nums.forEach(n=> apartments[n] = { num:n, pendencias:[], photos:[] });
    blocks[bid] = { id:bid, apartments };
  }

  const obra = { id, name, city: cityNorm, config:{ numBlocks: nb, aptsPerBlock: apb }, blocks };
  state.obras[id] = obra;
  state.obras_index.push({ id, name, city: obra.city, config: obra.config });
  state.obras_index = mergeObrasIndexLists([], state.obras_index);

  if(execUser && execPin){
    state.users.push({ id: execUser, name: "Execução " + name, role:"execucao", pin: String(execPin), obraIds:[id], active:true });
  }

  return { ok:true };
}

function deleteObra(obraId){
  delete state.obras[obraId];
  state.obras_index = state.obras_index.filter(o=>o.id!==obraId);
  state.users = state.users.filter(u => !(u.role==="execucao" && (u.obraIds||[]).includes(obraId)));
}

function renderUsers(root){
  const u = currentUser();
  if(!u) return goto("login");
  if(!canManageUsers(u) && !canViewOnly(u)) return goto("home");

  const users = (state.users||[]).filter(x=>x && x.active);
  root.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="h1">Usuários</div>
          <div class="small">Gerencie logins (usuário + PIN)</div>
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
            <th>Nome</th>
            <th>Perfil</th>
            <th>Acesso</th>
            <th>PIN</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(x=>{
            const access = x.role==="qualidade" ? (x.id==="qualidade_aguaslindas" ? "Águas Lindas" : "Valparaíso") : ((x.obraIds||[])[0]==="*" ? "Todas" : (x.obraIds||[]).join(", "));
            return `
              <tr>
                <td><b>${esc(x.id)}</b></td>
                <td>${esc(x.name)}</td>
                <td>${esc(x.role)}</td>
                <td>${esc(access)}</td>
                <td>${esc(x.pin)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>

      <div class="hr"></div>
      <div class="small">
        <b>Supervisor</b>: visualiza tudo, aprova/reprova após conferência da Qualidade e gerencia usuários.<br><br>
        <b>Qualidade</b>: cria pendências, confere o feito e gerencia obras/usuários de sua cidade.<br><br>
        <b>Execução</b>: vê apenas sua obra e marca como feito.
      </div>
    </div>
  `;

  $("#btnBackUsers").onclick = ()=> goto(canViewOnly(u) ? "dash" : "home");

  const btnAddSup = $("#btnAddSup");
  if(btnAddSup){
    btnAddSup.onclick = ()=>{
      const { backdrop, close } = openModal(`
        <div class="modal">
          <div class="row">
            <div>
              <div class="h2">Novo supervisor</div>
            </div>
            <button class="btn btn--ghost" id="mClose">✕</button>
          </div>
          <div class="hr"></div>
          <div class="grid">
            <div>
              <div class="small">Usuário</div>
              <input id="mUser" class="input" placeholder="Ex.: supervisor_02" />
            </div>
            <div>
              <div class="small">Nome</div>
              <input id="mName" class="input" placeholder="Ex.: Supervisor 02" />
            </div>
            <div>
              <div class="small">PIN</div>
              <input id="mPin" class="input" inputmode="numeric" maxlength="4" placeholder="Ex.: 4444" />
            </div>
            <div class="row" style="justify-content:flex-end">
              <button id="mCreate" class="btn btn--orange">Criar</button>
            </div>
          </div>
        </div>
      `);
      $("#mClose", backdrop).onclick = close;
      $("#mCreate", backdrop).onclick = ()=>{
        const id = ($("#mUser", backdrop).value||"").trim().toLowerCase();
        const name = ($("#mName", backdrop).value||"").trim();
        const pin = ($("#mPin", backdrop).value||"").trim();
        if(!id || !name || !pin) return toast("Preencha usuário, nome e PIN.");
        if(state.users.find(x=>x.id===id)) return toast("Usuário já existe.");
        state.users.push({ id, name, role:"supervisor", pin, obraIds:["*"], active:true });
        saveState();
        close();
        renderUsers(root);
        toast("Supervisor criado.");
      };
    };
  }
}

function renderObra(root){
  const u = currentUser();
  if(!u) return goto("login");

  const obraId = nav.params.obraId;
  const obra = state.obras[obraId];
  if(!obra){ toast("Obra não encontrada"); return goto(canViewOnly(u) ? "dash" : "home"); }

  if(!canAccessObra(u, obraId)){
    toast("Sem acesso a essa obra");
    return goto(canViewOnly(u) ? "dash" : "home");
  }

  if(u.role==="execucao" && !(u.obraIds||[]).includes(obraId)){
    toast("Sem acesso a essa obra.");
    return goto("home");
  }

  const blocks = Object.values(obra.blocks||{}).sort((a,b)=>Number(String(a.id).replace("B","")) - Number(String(b.id).replace("B","")));

  root.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
            <div class="h1">${esc(obra.name)}</div>
            <span class="badge" style="background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#fff;border:none;text-transform:uppercase;letter-spacing:.4px">${normalizeCity(obra.city)==="aguaslindas" ? "Águas Lindas" : "Valparaíso"}</span>
          </div>
          <div class="small">${obra.config.numBlocks} blocos • ${obra.config.aptsPerBlock} apto/bloco</div>
        </div>
      </div>
      <div class="hr"></div>

      <div class="grid blocks-grid">
        ${blocks.map(block=>`
          <button class="block-card" data-open-block="${esc(block.id)}">
            <div class="block-card__title">${esc(block.id)}</div>
            <div class="pills">${blockDots(obraId, block)}</div>
          </button>
        `).join("")}
      </div>
    </div>
  `;

  $$('[data-open-block]').forEach(btn=>{
    btn.onclick = ()=>{
      const blockId = btn.getAttribute("data-open-block");
      goto("apto", { obraId, blockId });
    };
  });
}

function renderApto(root){
  const u = currentUser();
  if(!u) return goto("login");

  const obraId = nav.params.obraId;
  const blockId = nav.params.blockId;
  const obra = state.obras[obraId];
  const block = obra?.blocks?.[blockId];
  if(!obra || !block) return goto(canViewOnly(u) ? "dash" : "home");

  const aptNums = aptNumsForBlock(obra, block);

  root.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="h1">${esc(obra.name)} • ${esc(blockId)}</div>
          <div class="small">Cidade: ${normalizeCity(obra.city)==="aguaslindas" ? "Águas Lindas" : "Valparaíso"} • Selecione o apartamento</div>
        </div>
      </div>
      <div class="hr"></div>

      <div class="grid apt-grid">
        ${aptNums.map(an=>{
          const a = getOrMakeApartment(obraId, blockId, an);
          const ps = a.pendencias||[];
          let cls = "apt";
          if(ps.length){
            let hasPend=false, hasWait=false, hasConf=false;
            ps.forEach(p=>{
              if(p.state==="pendente" || p.state==="reprovado") hasPend=true;
              else if(p.state==="feito") hasWait=true;
              else if(p.state==="conferido") hasConf=true;
            });
            if(hasPend) cls += " apt--pend";
            else if(hasWait) cls += " apt--wait";
            else if(hasConf) cls += " apt--conf";
            else cls += " apt--ok";
          }
          const dotCls = aptStatusClass(obraId, blockId, an);
          return `<button class="${cls}" data-open-apt="${esc(an)}">${dotCls ? `<span class="${dotCls}" style="margin-right:6px"></span>` : ``}${esc(an)}</button>`;
        }).join("")}
      </div>
    </div>
  `;

  $$('[data-open-apt]').forEach(btn=>{
    btn.onclick = ()=>{
      const apto = btn.getAttribute("data-open-apt");
      goto("apto", { obraId, blockId, apto });
      renderAptoDetalhe(root);
    };
  });

  if(nav.params.apto) return renderAptoDetalhe(root);
}

function renderAptoDetalhe(root){
  const u = currentUser();
  const { obraId, blockId, apto } = nav.params;
  const obra = state.obras[obraId];
  const apt = getOrMakeApartment(obraId, blockId, apto);

  const canAdd = canCreate(u);
  const canDone = canMarkDone(u);
  const canQuality = canQualityReview(u);
  const canSupervisor = canSupervisorApprove(u);
  const canRe = canReopen(u);

  root.innerHTML = `
    <div class="grid2">
      <div class="card">
        <div class="row">
          <div>
            <div class="h1">${esc(obra.name)} • ${esc(blockId)} • ${esc(apto)}</div>
            <div class="small">Cidade: ${normalizeCity(obra.city)==="aguaslindas" ? "Águas Lindas" : "Valparaíso"} • Pendências do apartamento</div>
          </div>
          <div class="row" style="gap:8px">
            ${canAdd ? `<button id="btnAddPend" class="btn btn--orange">+ Pendência</button>` : ``}
          </div>
        </div>
        <div class="hr"></div>

        <div class="grid">
          ${(apt.pendencias||[]).map(p=>`
            <div class="card">
              <div class="row">
                <div>
                  <div><b>${esc(p.title||"-")}</b></div>
                  <div class="small">${esc(p.category||"-")} • ${esc(p.location||"-")}</div>
                </div>
                <div class="badge" style="${statusBadgeStyle(p.state)}">${esc(statusLabel(p.state))}</div>
              </div>

              ${p.rejection ? `<div class="small" style="margin-top:8px"><b>Motivo:</b> ${esc(p.rejection)}</div>` : ``}
              ${(p.reviewedAt || p.approvedAt) ? `<div class="small" style="margin-top:8px">${p.reviewedAt ? `<div><b>Qualidade conferiu:</b> ${fmtDT(p.reviewedAt)}${p.reviewedBy?.name ? ` — ${esc(p.reviewedBy.name)}` : ``}</div>` : ``}${p.approvedAt ? `<div><b>Supervisor aprovou:</b> ${fmtDT(p.approvedAt)}${p.approvedBy?.name ? ` — ${esc(p.approvedBy.name)}` : ``}</div>` : ``}</div>` : ``}
              <div class="hr"></div>

              <div class="row" style="gap:8px; flex-wrap:wrap">
                ${canDone && (p.state==="pendente" || p.state==="reprovado") ? `<button class="btn" data-done="${esc(p.id)}">Marcar feito</button>` : ``}
                ${canQuality && p.state==="feito" ? `<button class="btn btn--orange" data-quality-ok="${esc(p.id)}">Conferir</button>` : ``}
                ${canQuality && p.state==="feito" ? `<button class="btn btn--red" data-quality-reprov="${esc(p.id)}">Reprovar</button>` : ``}
                ${canSupervisor && p.state==="conferido" ? `<button class="btn btn--orange" data-super-ok="${esc(p.id)}">Aprovar</button>` : ``}
                ${canSupervisor && p.state==="conferido" ? `<button class="btn btn--red" data-super-reprov="${esc(p.id)}">Reprovar</button>` : ``}
                ${canRe && (p.state==="conferido" || p.state==="concluido") ? `<button class="btn" data-reopen="${esc(p.id)}">Reabrir</button>` : ``}
                ${canAdd ? `<button class="btn" data-edit="${esc(p.id)}">Editar</button>` : ``}
                ${canAdd ? `<button class="btn btn--red" data-del="${esc(p.id)}">Apagar</button>` : ``}
              </div>

              <div class="hr"></div>
              <div class="small">${(ensureEvents(p)||[]).map(ev=>fmtEvent(ev)).join("<br>")}</div>
            </div>
          `).join("") || `<div class="small">Sem pendências.</div>`}
        </div>
      </div>
    </div>
  `;

  const btnAdd = $("#btnAddPend");
  if(btnAdd){
    btnAdd.onclick = ()=>{
      const { backdrop, close } = openModal(`
        <div class="modal">
          <div class="row">
            <div>
              <div class="h2">Nova pendência</div>
              <div class="small">${esc(obra.name)} • ${esc(blockId)} • ${esc(apto)}</div>
            </div>
            <button class="btn btn--ghost" id="mClose">✕</button>
          </div>
          <div class="hr"></div>
          <div class="grid">
            <div>
              <div class="small">Descrição</div>
              <input id="mTitle" class="input" placeholder="Ex.: Pintura com falha" />
            </div>
            <div>
              <div class="small">Categoria</div>
              <input id="mCat" class="input" placeholder="Ex.: Pintura" />
            </div>
            <div>
              <div class="small">Local</div>
              <input id="mLoc" class="input" placeholder="Ex.: Sala" />
            </div>
            <div class="row" style="justify-content:flex-end">
              <button id="mCreate" class="btn btn--orange">Adicionar</button>
            </div>
          </div>
        </div>
      `);
      $("#mClose", backdrop).onclick = close;
      $("#mCreate", backdrop).onclick = ()=>{
        const title = ($("#mTitle", backdrop).value||"").trim();
        const category = ($("#mCat", backdrop).value||"").trim();
        const location = ($("#mLoc", backdrop).value||"").trim();
        if(!title) return toast("Informe a descrição.");

        const p = {
          id: uid("p"),
          title, category, location,
          state: "pendente",
          createdAt: new Date().toISOString(),
          createdBy: currentUser() ? { id:currentUser().id, name:currentUser().name, role:currentUser().role } : null,
          doneAt:null, doneBy:null,
          reviewedAt:null, reviewedBy:null,
          approvedAt:null, approvedBy:null,
          rejection:null,
          reopenedAt:null,
          photos: [],
          events:[]
        };
        pushEvent(p, "criado", currentUser());
        apt.pendencias.push(p);
        saveState();
        close();
        renderAptoDetalhe(root);
        toast("Pendência adicionada.");
      };
    };
  }

  $$('[data-done]').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-done");
      const p = (apt.pendencias||[]).find(x=>x.id===id);
      if(!p) return;
      p.state = "feito";
      p.doneAt = new Date().toISOString();
      p.doneBy = currentUser() ? { id:currentUser().id, name:currentUser().name, role:currentUser().role } : null;
      p.reviewedAt = null;
      p.reviewedBy = null;
      p.approvedAt = null;
      p.approvedBy = null;
      p.rejection = null;
      pushEvent(p, "feito", currentUser());
      saveState();
      renderAptoDetalhe(root);
      toast("Marcado como feito.");
    };
  });

  $$('[data-quality-ok]').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-quality-ok");
      const p = (apt.pendencias||[]).find(x=>x.id===id);
      if(!p) return;
      p.state = "conferido";
      p.reviewedAt = new Date().toISOString();
      p.reviewedBy = currentUser() ? { id:currentUser().id, name:currentUser().name, role:currentUser().role } : null;
      p.approvedAt = null;
      p.approvedBy = null;
      pushEvent(p, "conferido", currentUser());
      saveState();
      renderAptoDetalhe(root);
      toast("Conferido pela Qualidade.");
    };
  });

  $$('[data-quality-reprov]').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-quality-reprov");
      const p = (apt.pendencias||[]).find(x=>x.id===id);
      if(!p) return;
      const note = prompt("Motivo da reprovação:", p.rejection||"");
      if(note===null) return;
      p.state = "reprovado";
      p.rejection = (note||"").trim();
      p.reviewedAt = new Date().toISOString();
      p.reviewedBy = currentUser() ? { id:currentUser().id, name:currentUser().name, role:currentUser().role } : null;
      p.approvedAt = null;
      p.approvedBy = null;
      pushEvent(p, "reprovado", currentUser(), { note:p.rejection });
      saveState();
      renderAptoDetalhe(root);
      toast("Pendência reprovada.");
    };
  });

  $$('[data-super-ok]').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-super-ok");
      const p = (apt.pendencias||[]).find(x=>x.id===id);
      if(!p) return;
      p.state = "concluido";
      p.approvedAt = new Date().toISOString();
      p.approvedBy = currentUser() ? { id:currentUser().id, name:currentUser().name, role:currentUser().role } : null;
      pushEvent(p, "aprovado", currentUser());
      saveState();
      renderAptoDetalhe(root);
      toast("Aprovado pelo Supervisor.");
    };
  });

  $$('[data-super-reprov]').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-super-reprov");
      const p = (apt.pendencias||[]).find(x=>x.id===id);
      if(!p) return;
      const note = prompt("Motivo da reprovação:", p.rejection||"");
      if(note===null) return;
      p.state = "reprovado";
      p.rejection = (note||"").trim();
      p.approvedAt = null;
      p.approvedBy = null;
      pushEvent(p, "reprovado", currentUser(), { note:p.rejection });
      saveState();
      renderAptoDetalhe(root);
      toast("Pendência reprovada pelo Supervisor.");
    };
  });

  $$('[data-reopen]').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-reopen");
      const p = (apt.pendencias||[]).find(x=>x.id===id);
      if(!p) return;
      p.state = "pendente";
      p.reopenedAt = new Date().toISOString();
      p.reviewedAt = null;
      p.reviewedBy = null;
      p.approvedAt = null;
      p.approvedBy = null;
      pushEvent(p, "reaberto", currentUser());
      saveState();
      renderAptoDetalhe(root);
      toast("Pendência reaberta.");
    };
  });

  $$('[data-edit]').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-edit");
      const p = (apt.pendencias||[]).find(x=>x.id===id);
      if(!p) return;
      const title = prompt("Editar descrição:", p.title||"");
      if(title===null) return;
      p.title = title.trim();
      pushEvent(p, "editado", currentUser());
      saveState();
      renderAptoDetalhe(root);
      toast("Pendência editada.");
    };
  });

  $$('[data-del]').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-del");
      const idx = (apt.pendencias||[]).findIndex(x=>x.id===id);
      if(idx<0) return;
      const p = apt.pendencias[idx];
      pushEvent(p, "apagado", currentUser());
      apt.pendencias.splice(idx,1);
      saveState();
      renderAptoDetalhe(root);
      toast("Pendência apagada.");
    };
  });
}

function renderSettings(root){
  const u = currentUser();
  if(!canResetData(u)) return goto("home");

  root.innerHTML = `
    <div class="card">
      <div class="h1">Configurações</div>
      <div class="small">Área restrita ao supervisor.</div>
      <div class="hr"></div>

      <div class="row" style="gap:8px; flex-wrap:wrap">
        <button id="btnExport" class="btn">Exportar JSON</button>
        <button id="btnImport" class="btn">Importar JSON</button>
        <button id="btnReset" class="btn btn--red">Resetar dados</button>
      </div>

      <input id="importFile" type="file" accept=".json,application/json" style="display:none" />
    </div>
  `;

  $("#btnExport").onclick = ()=>{
    const blob = new Blob([JSON.stringify(persistableState(), null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bela_mares_checklist_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  $("#btnImport").onclick = ()=> $("#importFile").click();

  $("#importFile").onchange = async (e)=>{
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    try{
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      if(!parsed || parsed.version !== STATE_VERSION) return toast("Arquivo inválido.");
      if(parsed.session) delete parsed.session;
      state = parsed;
      ensureSystemDefaults();
      saveState();
      toast("Dados importados.");
      goto("home");
    }catch(err){
      toast("Falha ao importar.");
    }finally{
      e.target.value = "";
    }
  };

  $("#btnReset").onclick = ()=>{
    const ok = confirm("Resetar todos os dados locais do app?");
    if(!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
    state = seed();
    ensureSystemDefaults();
    saveState();
    goto("login");
  };
}

ensureSystemDefaults();
initFirestore();
render();
