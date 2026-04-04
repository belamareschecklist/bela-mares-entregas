const APP_VERSION = "workflow-v6";
const STATE_VERSION = 30;

const STORAGE_KEY = "bm_checklist_classic_v1";
const SESSION_KEY = "bm_checklist_session_user";
const APARTMENTS_COLLECTION = "apartments";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBZuzY9l0lbgD9rf79mQ_-tbUoLWPVmN08",
  authDomain: "bela-mares-entregas.firebaseapp.com",
  projectId: "bela-mares-entregas",
  storageBucket: "bela-mares-entregas.firebasestorage.app",
  messagingSenderId: "159475494264",
  appId: "1:159475494264:web:953427de1a900f7aa3ac8d"
};

const APT_NUMS_12 = ["101","102","103","104","201","202","203","204","301","302","303","304"];
const APT_NUMS_16 = ["101","102","103","104","201","202","203","204","301","302","303","304","401","402","403","404"];

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

let localSaveDisabled = false;
let saveTimer = null;
let isApplyingRemote = false;

let fbApp = null;
let fbDb = null;
let fbReady = false;
let fbMetaUnsub = null;
let fbApartmentsUnsub = null;

const nav = { screen: "login", params: {} };

function toastEl(){ return $("#toast"); }
let toastTimer = null;
function toast(msg){
  const el = toastEl();
  if(!el) return;
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.style.display = "none"; }, 2500);
}

function esc(s){
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c]));
}

function uid(prefix="id"){
  return prefix + "_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

function slugify(input){
  try{
    return String(input || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }catch(e){
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }
}

function normalizeCity(v){
  const s = String(v || "").trim().toLowerCase();
  if(s.includes("formosa")) return "formosa";
  if(s.includes("aguas")) return "aguaslindas";
  return "valparaiso";
}

function cityLabel(city){
  const c = normalizeCity(city);
  if(c === "aguaslindas") return "Águas Lindas";
  if(c === "formosa") return "Formosa";
  return "Valparaíso";
}

function citySortKey(city){
  const c = normalizeCity(city);
  if(c === "valparaiso") return 1;
  if(c === "aguaslindas") return 2;
  if(c === "formosa") return 3;
  return 99;
}

function fmtDT(iso){
  if(!iso) return "-";
  try{
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }catch(e){
    return String(iso);
  }
}

function safeSetItem(key, value){
  if(localSaveDisabled) return;
  try{
    localStorage.setItem(key, value);
  }catch(e){
    console.warn("LocalStorage cheio. Cache local desativado.", e);
    localSaveDisabled = true;
    try{ localStorage.removeItem(key); }catch(_){}
  }
}

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

function getSessionUserId(){
  try{
    return (localStorage.getItem(SESSION_KEY) || "").trim().toLowerCase();
  }catch(e){
    return "";
  }
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

function aptNumsByConfig(aptsPerBlock){
  return Number(aptsPerBlock) === 16 ? APT_NUMS_16 : APT_NUMS_12;
}

function aptNumsForBlock(obra, block){
  const keys = Object.keys(block?.apartments || {});
  if(keys.length) return keys.sort((a,b)=>Number(a)-Number(b));
  return aptNumsByConfig(obra?.config?.aptsPerBlock || 12);
}

function seed(){
  const s = {
    version: STATE_VERSION,
    session: null,
    users: [
      { id:"supervisor_01", name:"Supervisor 01", role:"supervisor", pin:"3333", obraIds:["*"], active:true },
      { id:"qualidade_valparaiso", name:"Qualidade Valparaíso", role:"qualidade", pin:"2222", obraIds:["*"], active:true },
      { id:"qualidade_aguaslindas", name:"Qualidade Águas Lindas", role:"qualidade", pin:"2233", obraIds:["*"], active:true },
      { id:"qualidade_formosa", name:"Qualidade Formosa", role:"qualidade", pin:"2233", obraIds:["*"], active:true },
      { id:"exec_costa_rica", name:"Execução Costa Rica", role:"execucao", pin:"1234", obraIds:["costa_rica"], active:true },
      { id:"exec_costa_brava", name:"Execução Costa Brava", role:"execucao", pin:"5678", obraIds:["costa_brava"], active:true },
      { id:"coordenador_valparaiso", name:"Coordenador Valparaíso", role:"coordenador", pin:"7777", obraIds:["*"], active:true },
      { id:"coordenador_aguaslindas", name:"Coordenador Águas Lindas", role:"coordenador", pin:"7777", obraIds:["*"], active:true },
      { id:"coordenador_formosa", name:"Coordenador Formosa", role:"coordenador", pin:"7777", obraIds:["*"], active:true },
      { id:"engenheiro", name:"Engenheiro Geral", role:"engenheiro", pin:"8888", obraIds:["*"], active:true },
      { id:"diretor", name:"Diretor", role:"diretor", pin:"9999", obraIds:["*"], active:true }
    ],
    obras: {},
    obras_index: [],
    _meta: {}
  };

  function makeObra(id, name, numBlocks, aptsPerBlock, city){
    const blocks = {};
    for(let b=1;b<=numBlocks;b++){
      const bid = "B"+b;
      const apartments = {};
      const nums = aptNumsByConfig(aptsPerBlock);
      nums.forEach(n=>{
        apartments[n] = { num:n, pendencias:[], photos:[], _meta:{} };
      });
      blocks[bid] = { id:bid, apartments };
    }
    const obra = {
      id,
      name,
      city: normalizeCity(city),
      config: { numBlocks, aptsPerBlock },
      blocks
    };
    s.obras[id] = obra;
    s.obras_index.push({ id, name, city: obra.city, config: obra.config });
  }

  makeObra("costa_rica", "Costa Rica - Entregas", 17, 12, "valparaiso");
  makeObra("costa_brava", "Costa Brava - Entregas", 6, 12, "valparaiso");
  makeObra("park_rubi", "Park Rubi - Entregas", 6, 12, "valparaiso");

  return s;
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return seed();
    const parsed = JSON.parse(raw);
    if(!parsed || typeof parsed !== "object") return seed();
    if(parsed.session) delete parsed.session;
    parsed.version = STATE_VERSION;
    if(!parsed._meta) parsed._meta = {};
    return parsed;
  }catch(e){
    return seed();
  }
}

let state = loadState();

function persistableState(){
  const copy = JSON.parse(JSON.stringify(state));
  if(copy && copy.session) delete copy.session;
  return copy;
}

function persistableStateForLocal(){
  const s = persistableState();
  try{ stripLargeFields(s); }catch(_){}
  return s;
}

function ensureBlockAndApartmentStructure(obra){
  if(!obra) return;
  obra.config = obra.config || { numBlocks: 0, aptsPerBlock: 12 };
  obra.blocks = obra.blocks || {};
  const totalBlocks = Number(obra.config.numBlocks || Object.keys(obra.blocks).length || 0);
  const nums = aptNumsByConfig(obra.config.aptsPerBlock || 12);
  for(let i=1;i<=totalBlocks;i++){
    const bid = "B" + i;
    if(!obra.blocks[bid]) obra.blocks[bid] = { id: bid, apartments: {} };
    obra.blocks[bid].apartments = obra.blocks[bid].apartments || {};
    nums.forEach(an=>{
      if(!obra.blocks[bid].apartments[an]) obra.blocks[bid].apartments[an] = { num: an, pendencias: [], photos: [], _meta: {} };
    });
  }
}

function ensureSystemDefaults(){
  state.obras = state.obras || {};
  state.obras_index = state.obras_index || [];
  state.users = state.users || [];

  const defaults = [
    { id:"supervisor_01", name:"Supervisor 01", role:"supervisor", pin:"3333", obraIds:["*"], active:true },
    { id:"qualidade_valparaiso", name:"Qualidade Valparaíso", role:"qualidade", pin:"2222", obraIds:["*"], active:true },
    { id:"qualidade_aguaslindas", name:"Qualidade Águas Lindas", role:"qualidade", pin:"2233", obraIds:["*"], active:true },
    { id:"qualidade_formosa", name:"Qualidade Formosa", role:"qualidade", pin:"2233", obraIds:["*"], active:true },
    { id:"exec_costa_rica", name:"Execução Costa Rica", role:"execucao", pin:"1234", obraIds:["costa_rica"], active:true },
    { id:"exec_costa_brava", name:"Execução Costa Brava", role:"execucao", pin:"5678", obraIds:["costa_brava"], active:true },
    { id:"coordenador_valparaiso", name:"Coordenador Valparaíso", role:"coordenador", pin:"7777", obraIds:["*"], active:true },
    { id:"coordenador_aguaslindas", name:"Coordenador Águas Lindas", role:"coordenador", pin:"7777", obraIds:["*"], active:true },
    { id:"coordenador_formosa", name:"Coordenador Formosa", role:"coordenador", pin:"7777", obraIds:["*"], active:true },
    { id:"engenheiro", name:"Engenheiro Geral", role:"engenheiro", pin:"8888", obraIds:["*"], active:true },
    { id:"diretor", name:"Diretor", role:"diretor", pin:"9999", obraIds:["*"], active:true }
  ];
  defaults.forEach(d=>{
    if(!state.users.find(u=>u.id===d.id)) state.users.push(d);
  });


  state.users = state.users.filter((u, idx, arr) => {
    if(!u || !u.id) return false;
    if(u.id === "coordenador") return false;
    return arr.findIndex(x => x && x.id === u.id) === idx;
  });


  for(const oid of Object.keys(state.obras)){
    const obra = state.obras[oid];
    obra.city = normalizeCity(obra.city || "valparaiso");
    obra.config = obra.config || { numBlocks: Object.keys(obra.blocks || {}).length || 0, aptsPerBlock: 12 };
    obra.blocks = obra.blocks || {};
    ensureBlockAndApartmentStructure(obra);
    for(const bid of Object.keys(obra.blocks)){
      const block = obra.blocks[bid];
      block.apartments = block.apartments || {};
      for(const an of Object.keys(block.apartments)){
        const apt = block.apartments[an];
        apt.num = apt.num || an;
        apt.pendencias = Array.isArray(apt.pendencias) ? apt.pendencias : [];
        apt.photos = Array.isArray(apt.photos) ? apt.photos : [];
        apt._meta = apt._meta || {};
        apt.pendencias.forEach(migratePendenciaWorkflow);
      }
    }
  }

  state.obras_index = mergeObrasIndexLists(
    state.obras_index,
    Object.values(state.obras).map(o=>({
      id: o.id,
      name: o.name,
      city: o.city,
      config: o.config
    }))
  );
}

function mergeObrasIndexLists(localList, incomingList){
  const map = new Map();
  (Array.isArray(localList) ? localList : []).forEach(item=>{
    if(item && item.id) map.set(item.id, { ...item });
  });
  (Array.isArray(incomingList) ? incomingList : []).forEach(item=>{
    if(!item || !item.id) return;
    const prev = map.get(item.id) || {};
    map.set(item.id, {
      ...prev,
      ...item,
      city: normalizeCity(item.city || prev.city || "valparaiso")
    });
  });
  return Array.from(map.values()).sort((a,b)=>
    String(a.name || a.id).localeCompare(String(b.name || b.id), "pt-BR")
  );
}

function migratePendenciaWorkflow(p){
  if(!p || typeof p !== "object") return p;
  if(!p.events) p.events = [];
  if(p.state === "aprovado") p.state = "concluido";
  if(!p.createdAt) p.createdAt = new Date().toISOString();
  return p;
}

function getOrMakeApartment(obraId, blockId, aptNum){
  const obra = state.obras[obraId];
  if(!obra) return null;
  if(!obra.blocks[blockId]) obra.blocks[blockId] = { id:blockId, apartments:{} };
  const block = obra.blocks[blockId];
  if(!block.apartments) block.apartments = {};
  const an = String(aptNum);
  if(!block.apartments[an]){
    block.apartments[an] = { num:an, pendencias:[], photos:[], _meta:{} };
  }
  return block.apartments[an];
}

function getApartmentView(obraId, blockId, aptNum){
  const obra = state.obras[obraId];
  const block = obra?.blocks?.[blockId];
  const an = String(aptNum);
  return (block?.apartments && block.apartments[an]) ? block.apartments[an] : { num:an, pendencias:[], photos:[], _meta:{} };
}

function apartmentStrength(apt){
  if(!apt) return 0;
  const p = Array.isArray(apt.pendencias) ? apt.pendencias.length : 0;
  const f = Array.isArray(apt.photos) ? apt.photos.length : 0;
  return (p * 1000) + f;
}

function aptUpdatedMs(apt){
  if(!apt) return 0;
  const metaTs = Number(apt?._meta?.updatedAtMs || 0);
  let maxTs = metaTs;
  for(const p of (apt.pendencias || [])){
    const ts = Date.parse(p.updatedAt || p.approvedAt || p.reviewedAt || p.doneAt || p.createdAt || 0) || 0;
    if(ts > maxTs) maxTs = ts;
  }
  return maxTs;
}

function shouldReplaceLocalApartment(localApt, incomingDoc){
  if(!localApt) return true;
  const incomingApt = {
    pendencias: Array.isArray(incomingDoc?.pendencias) ? incomingDoc.pendencias : [],
    photos: Array.isArray(incomingDoc?.photos) ? incomingDoc.photos : [],
    _meta: { updatedAtMs: Number(incomingDoc?.updatedAtMs || 0) }
  };

  const localStrength = apartmentStrength(localApt);
  const incomingStrength = apartmentStrength(incomingApt);
  const localTs = aptUpdatedMs(localApt);
  const incomingTs = aptUpdatedMs(incomingApt);

  if(incomingStrength > localStrength) return true;
  if(incomingStrength < localStrength) return false;
  return incomingTs >= localTs;
}

function makeAptDocId(obraId, blockId, apto){
  return `${obraId}__${blockId}__${String(apto)}`;
}

function ensureAptPath(obraId, blockId, apto){
  if(!state.obras) state.obras = {};
  if(!state.obras[obraId]){
    state.obras[obraId] = {
      id: obraId,
      name: obraId,
      city: "valparaiso",
      config: { numBlocks:0, aptsPerBlock:12 },
      blocks: {}
    };
  }
  if(!state.obras[obraId].blocks) state.obras[obraId].blocks = {};
  if(!state.obras[obraId].blocks[blockId]) state.obras[obraId].blocks[blockId] = { id:blockId, apartments:{} };
  if(!state.obras[obraId].blocks[blockId].apartments) state.obras[obraId].blocks[blockId].apartments = {};
  if(!state.obras[obraId].blocks[blockId].apartments[String(apto)]){
    state.obras[obraId].blocks[blockId].apartments[String(apto)] = { num:String(apto), pendencias:[], photos:[], _meta:{} };
  }
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
    if(!shouldReplaceLocalApartment(target, doc)) return;
    target.pendencias = Array.isArray(doc.pendencias) ? doc.pendencias : [];
    target.photos = Array.isArray(doc.photos) ? doc.photos : [];
    if(!target._meta) target._meta = {};
    target._meta.updatedAtMs = Number(doc.updatedAtMs || Date.now());
  }catch(e){
    console.warn("Falha ao aplicar apartment doc:", e);
  }
}

function currentUser(){
  const sid = getSessionUserId();
  if(!sid) return null;
  return state.users.find(u=>String(u.id).toLowerCase()===sid && u.active) || null;
}

function canViewOnly(u){ return ["diretor","engenheiro","coordenador"].includes(u.role); }
function canCreate(u){ return ["qualidade","supervisor"].includes(u.role); }
function canMarkDone(u){ return u.role === "execucao"; }
function canQualityReview(u){ return u.role === "qualidade"; }
function canSupervisorApprove(u){ return u.role === "supervisor"; }
function canManageObras(u){ return ["qualidade","supervisor"].includes(u.role); }
function canManageUsers(u){ return ["qualidade","supervisor"].includes(u.role); }
function canResetData(u){ return u && u.role === "supervisor"; }
function canCreateSupervisor(u){ return u.role === "supervisor"; }
function canDeleteObra(u){ return u.role === "supervisor"; }
function canReopen(u){ return ["qualidade","supervisor"].includes(u.role); }

function userCities(u){
  if(!u) return [];
  if(["supervisor","diretor","engenheiro"].includes(u.role)) return ["*"];
  if(u.role === "execucao") return [];
  if(u.id === "qualidade_aguaslindas" || u.id === "coordenador_aguaslindas") return ["aguaslindas"];
  if(u.id === "qualidade_formosa" || u.id === "coordenador_formosa") return ["formosa"];
  return ["valparaiso"];
}

function cityStatsFromObras(obras){
  const total = { obras: obras.length, total:0, semVistoria:0, pend:0, aguard:0, conferido:0, conclu:0 };
  obras.forEach(o=>{
    const s = calcObraStats(o.id);
    total.total += s.total;
    total.semVistoria += s.semVistoria;
    total.pend += s.pend;
    total.aguard += s.aguard;
    total.conferido += s.conferido;
    total.conclu += s.conclu;
  });
  return total;
}

function obrasByCityForUser(u, city){
  return visibleObrasForUser(u).filter(o => normalizeCity(o.city) === normalizeCity(city));
}

function canAccessObra(u, obraId){
  if(!u) return false;
  const obra = state.obras?.[obraId] || state.obras_index.find(o=>o.id===obraId);
  const city = normalizeCity(obra?.city || "valparaiso");
  const cities = userCities(u);

  if(["supervisor","diretor","engenheiro"].includes(u.role)) return true;
  if(u.role === "coordenador") return cities.includes("*") || cities.includes(city);
  if(u.role === "execucao") return (u.obraIds || []).includes(obraId) || (u.obraIds || []).includes("*");
  if(u.role === "qualidade") return cities.includes("*") || cities.includes(city);
  return false;
}

function visibleObrasForUser(u){
  const list = Array.isArray(state.obras_index) ? state.obras_index : [];
  return list.filter(o => canAccessObra(u, o.id));
}

function persistLocal(){
  safeSetItem(STORAGE_KEY, JSON.stringify(persistableStateForLocal()));
}

function persistableMetaState(){
  const copy = persistableState();
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

function queueSaveToFirestore(){
  if(!fbReady) return;
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async ()=>{
    if(isApplyingRemote) return;
    const now = Date.now();
    try{
      const metaRef = fbDb.collection("apps").doc("bela_mares_checklist").collection("state").doc("meta");
      await metaRef.set({
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        updatedAtMs: now,
        meta: JSON.stringify(persistableMetaState())
      }, { merge:true });
    }catch(e){
      console.error("Erro salvando meta:", e);
    }
  }, 250);
}

async function saveApartmentNowToFirestore(obraId, blockId, apto){
  if(!fbReady) return;
  const apt = ensureAptPath(obraId, blockId, apto);
  const obra = state.obras?.[obraId];
  const now = Date.now();

  const ref = fbDb
    .collection("apps")
    .doc("bela_mares_checklist")
    .collection(APARTMENTS_COLLECTION)
    .doc(makeAptDocId(obraId, blockId, apto));

  await ref.set({
    obraId,
    obraName: obra?.name || obraId,
    blockId,
    apto: String(apto),
    pendencias: Array.isArray(apt.pendencias) ? apt.pendencias : [],
    photos: Array.isArray(apt.photos) ? apt.photos : [],
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    updatedAtMs: now
  }, { merge:true });

  if(!apt._meta) apt._meta = {};
  apt._meta.updatedAtMs = now;
}

async function saveMetaNowToFirestore(){
  if(!fbReady) return;
  const now = Date.now();
  const metaRef = fbDb
    .collection("apps")
    .doc("bela_mares_checklist")
    .collection("state")
    .doc("meta");

  await metaRef.set({
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    updatedAtMs: now,
    meta: JSON.stringify(persistableMetaState())
  }, { merge:true });
}

function saveState(){
  persistLocal();
  queueSaveToFirestore();
}

function initFirestore(){
  try{
    if(!window.firebase || !window.firebase.initializeApp || !window.firebase.firestore) return;
    fbApp = window.firebase.apps && window.firebase.apps.length
      ? window.firebase.apps[0]
      : window.firebase.initializeApp(FIREBASE_CONFIG);

    fbDb = window.firebase.firestore();
    fbReady = true;

    const metaRef = fbDb.collection("apps").doc("bela_mares_checklist").collection("state").doc("meta");
    if(fbMetaUnsub) try{ fbMetaUnsub(); }catch(_){}
    fbMetaUnsub = metaRef.onSnapshot((snap)=>{
      if(!snap || !snap.exists) return;

      const data = snap.data() || {};
      if(!data.meta) return;

      try{
        const parsed = JSON.parse(data.meta);
        if(parsed && typeof parsed === "object"){
          const prevObras = state.obras || {};
          const remoteObras = (parsed.obras && typeof parsed.obras === "object") ? parsed.obras : {};
          const nextObras = {};

          for(const oid of Object.keys(remoteObras)){
            const incoming = remoteObras[oid] || {};
            const prev = prevObras[oid] || {};
            nextObras[oid] = {
              ...incoming,
              blocks: prev.blocks || incoming.blocks || {}
            };
            if(prev.name && !nextObras[oid].name) nextObras[oid].name = prev.name;
            if(prev.city && !nextObras[oid].city) nextObras[oid].city = prev.city;
            if(prev.config && !nextObras[oid].config) nextObras[oid].config = prev.config;
          }

          state.users = Array.isArray(parsed.users) ? parsed.users : (state.users || []);
          state.obras = nextObras;
          state.obras_index = Array.isArray(parsed.obras_index)
            ? mergeObrasIndexLists([], parsed.obras_index)
            : mergeObrasIndexLists([], Object.values(nextObras).map(o => ({ id:o.id, name:o.name, city:o.city, config:o.config })));
        }

        ensureSystemDefaults();
        if(nav.screen === "obra" && nav.params?.obraId && !state.obras[nav.params.obraId]){
          nav.screen = canViewOnly(currentUser() || {}) ? "dash" : "home";
          nav.params = {};
        }
        if(nav.screen === "apto" && nav.params?.obraId && !state.obras[nav.params.obraId]){
          nav.screen = canViewOnly(currentUser() || {}) ? "dash" : "home";
          nav.params = {};
        }
        persistLocal();
        render();
      }catch(e){
        console.warn("Meta inválido:", e);
      }
    });

    const aRef = fbDb.collection("apps").doc("bela_mares_checklist").collection(APARTMENTS_COLLECTION);
    if(fbApartmentsUnsub) try{ fbApartmentsUnsub(); }catch(_){}
    fbApartmentsUnsub = aRef.onSnapshot((qs)=>{
      if(!qs) return;

      isApplyingRemote = true;
      try{
        qs.docChanges().forEach((ch)=>{
          if(ch.type === "removed") return;
          const data = ch.doc.data() || {};
          applyApartmentFromDoc(data);
        });
        persistLocal();
        render();
      }finally{
        isApplyingRemote = false;
      }
    });
  }catch(e){
    console.warn("Falha ao iniciar Firestore:", e);
  }
}

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
    if(back) back.style.display = (nav.screen === "home" || (nav.screen === "dash" && !nav.params.city)) ? "none" : "inline-flex";
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
      if(nav.screen === "apto"){
        if(nav.params.apto) return goto("apto", { obraId: nav.params.obraId, blockId: nav.params.blockId });
        return goto("obra", { obraId: nav.params.obraId });
      }
      if(nav.screen === "obra") return goto(canViewOnly(u) ? "dash" : "home");
      if(nav.screen === "users") return goto("dash", nav.params.city ? { city: nav.params.city } : {});
      if(nav.screen === "settings") return goto("dash", nav.params.city ? { city: nav.params.city } : {});
      if(nav.screen === "dash" && nav.params.city) return goto("dash");
      goto("dash");
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

function safeObraConfig(item){
  const real = state.obras?.[item?.id] || {};
  const cfg = item?.config || real.config || {};
  return {
    numBlocks: Number(cfg.numBlocks || Object.keys(real.blocks || {}).length || 0),
    aptsPerBlock: Number(cfg.aptsPerBlock || 0)
  };
}

function calcObraStats(obraId){
  const obra = state.obras[obraId];
  if(!obra) return { total:0, semVistoria:0, pend:0, aguard:0, conferido:0, conclu:0 };

  let total=0, semVistoria=0, pend=0, aguard=0, conferido=0, conclu=0;

  Object.values(obra.blocks || {}).forEach(block=>{
    const nums = aptNumsForBlock(obra, block);
    nums.forEach(an=>{
      const apt = getApartmentView(obraId, block.id, an);
      total++;

      const ps = apt.pendencias || [];
      if(!ps.length){
        semVistoria++;
        return;
      }

      let hasPend=false, hasAguard=false, hasConferido=false;
      ps.forEach(p=>{
        if(p.state === "pendente" || p.state === "reprovado") hasPend = true;
        else if(p.state === "feito") hasAguard = true;
        else if(p.state === "conferido") hasConferido = true;
      });

      if(hasPend) pend++;
      else if(hasAguard) aguard++;
      else if(hasConferido) conferido++;
      else conclu++;
    });
  });

  return { total, semVistoria, pend, aguard, conferido, conclu };
}

function aptStatusClass(obraId, blockId, an){
  const a = getApartmentView(obraId, blockId, an);
  const ps = a.pendencias || [];
  if(!ps.length) return "";
  let hasPend=false, hasWait=false, hasConf=false;
  ps.forEach(p=>{
    if(p.state==="pendente" || p.state==="reprovado") hasPend=true;
    else if(p.state==="feito") hasWait=true;
    else if(p.state==="conferido") hasConf=true;
  });
  if(hasPend) return "dot dot--r";
  if(hasWait) return "dot dot--o";
  if(hasConf) return "dot dot--b";
  return "dot dot--g";
}

function blockDots(obraId, block){
  const obra = state.obras[obraId];
  const nums = aptNumsForBlock(obra, block);
  let done=0, conf=0, wait=0, pend=0;

  nums.forEach(an=>{
    const a = getApartmentView(obraId, block.id, an);
    const ps = a.pendencias || [];
    if(!ps.length) return;

    let hasPend=false, hasWait=false, hasConf=false;
    ps.forEach(p=>{
      if(p.state === "pendente" || p.state === "reprovado") hasPend = true;
      else if(p.state === "feito") hasWait = true;
      else if(p.state === "conferido") hasConf = true;
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

function statusLabel(stateValue){
  if(stateValue === "pendente") return "Pendente";
  if(stateValue === "feito") return "Aguardando conferência";
  if(stateValue === "conferido") return "Conferido";
  if(stateValue === "concluido") return "Concluído";
  if(stateValue === "reprovado") return "Reprovado";
  return String(stateValue || "-");
}

function statusBadgeStyle(stateValue){
  if(stateValue === "pendente" || stateValue === "reprovado") return "background:#3b1114;color:#ffb4b4;border:1px solid #7f1d1d;";
  if(stateValue === "feito") return "background:#3d2a12;color:#ffd79a;border:1px solid #9a6700;";
  if(stateValue === "conferido") return "background:#102a43;color:#bfe3ff;border:1px solid #1d4ed8;";
  if(stateValue === "concluido") return "background:#0f2f1f;color:#bbf7d0;border:1px solid #15803d;";
  return "background:#1f2937;color:#e5e7eb;border:1px solid #374151;";
}

function ensureRuntimeStyles(){
  if(document.getElementById("bm-runtime-styles")) return;
  const st = document.createElement("style");
  st.id = "bm-runtime-styles";
  st.textContent = `
    .dot{display:inline-block;width:10px;height:10px;border-radius:999px}
    .dot--r{background:#dc2626}
    .dot--o{background:#f59e0b}
    .dot--b{background:#2563eb}
    .dot--g{background:#16a34a}
    .apt--conf{ background:rgba(37,99,235,.14)!important; border-color:#2563eb!important; color:#dbeafe!important; }
    .kpi__v{ color:#2563eb!important; }
    .kpi__l{ color:#475569!important; }
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

  if(!u && nav.screen !== "login"){
    nav.screen = "login";
    nav.params = {};
  }

  if(nav.screen === "login") return renderLogin(root);
  if(nav.screen === "dash") return renderDash(root);
  if(nav.screen === "home") return renderHome(root);
  if(nav.screen === "obra") return renderObra(root);
  if(nav.screen === "apto") return renderApto(root);
  if(nav.screen === "users") return renderUsers(root);
  if(nav.screen === "settings") return renderSettings(root);

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
        <div class="small">Sistema de checklist de conferência</div>
        <div class="hr"></div>
        <div class="small">
          <b>Qualidade</b>: cria pendências, confere e reabre.<br><br>
          <b>Execução</b>: marca feito.<br><br>
          <b>Supervisor</b>: aprova após conferido.<br><br>
          <b>Diretor / Engenheiro / Coordenador</b>: visualização.
        </div>
      </div>
    </div>
  `;

  $("#btnEntrar").onclick = ()=>{
    const user = ($("#loginUser").value || "").trim().toLowerCase();
    const pin = ($("#loginPin").value || "").trim();
    const found = state.users.find(u=>u.id===user && u.pin===pin && u.active);
    if(!found) return toast("Usuário/PIN inválido.");
        setSessionUserId(found.id);
    goto(canViewOnly(found) ? "dash" : "home");
  };
}

function renderDash(root){
  const u = currentUser();
  if(!u) return goto("login");

  if(u.role === "execucao") return renderExecucaoDash(root, u);

  if(u.role === "qualidade") {
    const cities = userCities(u).filter(c => c !== "*");
    const city = normalizeCity(nav.params.city || cities[0] || "valparaiso");
    return renderCityDashboard(root, u, city, false);
  }

  const city = nav.params.city ? normalizeCity(nav.params.city) : "";
  if(city) return renderCityDashboard(root, u, city, true);

  const cities = ["valparaiso","aguaslindas","formosa"];
  const cards = cities.map(city => {
    const obras = obrasByCityForUser(u, city);
    const s = cityStatsFromObras(obras);
    return `
      <button class="card" data-open-city="${city}" style="text-align:left">
        <div class="row">
          <div>
            <div class="h2">${cityLabel(city)}</div>
            <div class="small">${s.obras} obra(s)</div>
          </div>
        </div>
        <div class="hr"></div>
        <div class="kpis">
          <div class="kpi"><div class="kpi__v">${s.total}</div><div class="kpi__l">Qtd aptos</div></div>
          <div class="kpi"><div class="kpi__v">${s.semVistoria}</div><div class="kpi__l">Sem vistoria</div></div>
          <div class="kpi"><div class="kpi__v">${s.pend}</div><div class="kpi__l">Pendência</div></div>
          <div class="kpi"><div class="kpi__v">${s.aguard}</div><div class="kpi__l">Aguardando conferência</div></div>
          <div class="kpi"><div class="kpi__v">${s.conferido}</div><div class="kpi__l">Conferido</div></div>
          <div class="kpi"><div class="kpi__v">${s.conclu}</div><div class="kpi__l">Concluído</div></div>
        </div>
      </button>
    `;
  }).join("");

  root.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="h1">Dashboard por cidade</div>
          <div class="small">Selecione uma cidade para ver o resumo e as obras.</div>
        </div>
        <div class="row" style="gap:8px">
          ${canManageObras(u) ? `<button id="btnIrObras" class="btn">Tabela de obras</button>` : ``}
          ${["supervisor","diretor","engenheiro","coordenador"].includes(u.role) ? `<button id="btnPdfResumoGeral" class="btn">PDF Resumo</button>` : ``}
          ${canManageUsers(u) ? `<button id="btnUsersDash" class="btn">Usuários</button>` : ``}
        </div>
      </div>
      <div class="hr"></div>
      <div class="grid2">${cards}</div>
    </div>
  `;

  $$("[data-open-city]").forEach(btn => {
    btn.onclick = ()=> goto("dash", { city: btn.getAttribute("data-open-city") });
  });
  const btnIrObras = $("#btnIrObras");
  if(btnIrObras) btnIrObras.onclick = ()=> goto("home");
  const btnPdfResumoGeral = $("#btnPdfResumoGeral");
  if(btnPdfResumoGeral) btnPdfResumoGeral.onclick = ()=> gerarPDFResumoDashboard(u, "");
  const btnUsersDash = $("#btnUsersDash");
  if(btnUsersDash) btnUsersDash.onclick = ()=> goto("users");
}

function renderCityDashboard(root, u, city, showBackToCities){
  const obras = obrasByCityForUser(u, city).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id), "pt-BR"));
  const s = cityStatsFromObras(obras);

  root.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="h1">${cityLabel(city)}</div>
          <div class="small">Resumo da cidade e obras vinculadas.</div>
        </div>
        <div class="row" style="gap:8px">
          ${showBackToCities ? `<button id="btnBackCities" class="btn">Cidades</button>` : ``}
          ${["supervisor","diretor","engenheiro","coordenador"].includes(u.role) ? `<button id="btnPdfResumoCidade" class="btn">PDF Resumo</button>` : ``}
          ${canManageObras(u) ? `<button id="btnIrObrasCidade" class="btn">Tabela de obras</button>` : ``}
        </div>
      </div>
      <div class="hr"></div>

      <div class="kpis">
        <div class="kpi"><div class="kpi__v">${s.obras}</div><div class="kpi__l">Obras</div></div>
        <div class="kpi"><div class="kpi__v">${s.total}</div><div class="kpi__l">Qtd aptos</div></div>
        <div class="kpi"><div class="kpi__v">${s.semVistoria}</div><div class="kpi__l">Sem vistoria</div></div>
        <div class="kpi"><div class="kpi__v">${s.pend}</div><div class="kpi__l">Pendência</div></div>
        <div class="kpi"><div class="kpi__v">${s.aguard}</div><div class="kpi__l">Aguardando conferência</div></div>
        <div class="kpi"><div class="kpi__v">${s.conferido}</div><div class="kpi__l">Conferido</div></div>
        <div class="kpi"><div class="kpi__v">${s.conclu}</div><div class="kpi__l">Concluído</div></div>
      </div>

      <div class="hr"></div>
      <table class="table">
        <thead>
          <tr>
            <th>Obra</th>
            <th style="text-align:center">Qtd aptos</th>
            <th style="text-align:center">Sem vistoria</th>
            <th style="text-align:center">Pendência</th>
            <th style="text-align:center">Aguardando conferência</th>
            <th style="text-align:center">Conferido</th>
            <th style="text-align:center">Concluído</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${obras.map(o=>{
            const os = calcObraStats(o.id);
            const cfg = safeObraConfig(o);
            return `
              <tr>
                <td><b>${esc(o.name || o.id)}</b><div class="small">${cfg.numBlocks || "-"} blocos • ${cfg.aptsPerBlock || "-"} apto/bloco</div></td>
                <td style="text-align:center"><b>${os.total}</b></td>
                <td style="text-align:center"><b>${os.semVistoria}</b></td>
                <td style="text-align:center"><b>${os.pend}</b></td>
                <td style="text-align:center"><b>${os.aguard}</b></td>
                <td style="text-align:center"><b>${os.conferido}</b></td>
                <td style="text-align:center"><b>${os.conclu}</b></td>
                <td style="text-align:right"><button class="btn" data-open-obra-city="${esc(o.id)}">Abrir</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  const btnBackCities = $("#btnBackCities");
  if(btnBackCities) btnBackCities.onclick = ()=> goto("dash");
  const btnPdfResumoCidade = $("#btnPdfResumoCidade");
  if(btnPdfResumoCidade) btnPdfResumoCidade.onclick = ()=> gerarPDFResumoDashboard(u, city);
  const btnIrObrasCidade = $("#btnIrObrasCidade");
  if(btnIrObrasCidade) btnIrObrasCidade.onclick = ()=> goto("home", { city });
  $$("[data-open-obra-city]").forEach(btn => {
    btn.onclick = ()=> goto("obra", { obraId: btn.getAttribute("data-open-obra-city") });
  });
}

function renderExecucaoDash(root, u){
  const obras = visibleObrasForUser(u);
  root.innerHTML = `
    <div class="card">
      <div class="h1">Minha obra</div>
      <div class="small">Resumo das obras vinculadas ao seu login.</div>
      <div class="hr"></div>
      <div class="grid">
        ${obras.map(o=>{
          const s = calcObraStats(o.id);
          return `
            <div class="card">
              <div class="row">
                <div>
                  <div class="h2">${esc(o.name || o.id)}</div>
                  <div class="small">${cityLabel(o.city)}</div>
                </div>
                <button class="btn" data-open-exec-obra="${esc(o.id)}">Abrir obra</button>
              </div>
              <div class="hr"></div>
              <div class="kpis">
                <div class="kpi"><div class="kpi__v">${s.total}</div><div class="kpi__l">Qtd aptos</div></div>
                <div class="kpi"><div class="kpi__v">${s.semVistoria}</div><div class="kpi__l">Sem vistoria</div></div>
                <div class="kpi"><div class="kpi__v">${s.pend}</div><div class="kpi__l">Pendência</div></div>
                <div class="kpi"><div class="kpi__v">${s.aguard}</div><div class="kpi__l">Aguardando conferência</div></div>
                <div class="kpi"><div class="kpi__v">${s.conferido}</div><div class="kpi__l">Conferido</div></div>
                <div class="kpi"><div class="kpi__v">${s.conclu}</div><div class="kpi__l">Concluído</div></div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
  $$("[data-open-exec-obra]").forEach(btn => {
    btn.onclick = ()=> goto("obra", { obraId: btn.getAttribute("data-open-exec-obra") });
  });
}

function renderHome(root){
  const u = currentUser();
  if(!u) return goto("login");

  const cityFilter = nav.params.city ? normalizeCity(nav.params.city) : "";
  const obrasVisiveis = visibleObrasForUser(u).filter(o => !cityFilter || normalizeCity(o.city) === cityFilter);
  const grouped = ["valparaiso","aguaslindas","formosa"].map(city => ({ city, arr: obrasVisiveis.filter(o => normalizeCity(o.city) === city) }));

  function renderSection(title, arr){
    if(!arr.length) return "";
    return `
      <tr>
        <td colspan="8" style="padding:0;border:none;background:transparent">
          <div style="margin:14px 0 6px;padding:12px 14px;border-radius:14px;background:linear-gradient(135deg,#0f172a,#1e293b);color:#f8fafc;display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div style="font-weight:800">${title}</div>
            <div style="font-size:12px;opacity:.85">${arr.length} obra(s)</div>
          </div>
        </td>
      </tr>
      ${arr.map(o=>{
        const s = calcObraStats(o.id);
        const cfg = safeObraConfig(o);
        return `
          <tr>
            <td><b>${esc(o.name || o.id || "Obra")}</b><div class="small">${cfg.numBlocks || "-"} blocos • ${cfg.aptsPerBlock || "-"} apto/bloco</div></td>
            <td style="text-align:center"><b>${s.total}</b></td>
            <td style="text-align:center"><b>${s.semVistoria}</b></td>
            <td style="text-align:center"><b>${s.pend}</b></td>
            <td style="text-align:center"><b>${s.aguard}</b></td>
            <td style="text-align:center"><b>${s.conferido}</b></td>
            <td style="text-align:center"><b>${s.conclu}</b></td>
            <td style="text-align:right">
              <button class="btn" data-open="${esc(o.id)}">Abrir</button>
              ${canDeleteObra(u) ? `<button class="btn btn--red" data-del="${esc(o.id)}">Apagar</button>` : ``}
            </td>
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
            <div class="h1">Obras${cityFilter ? ` • ${cityLabel(cityFilter)}` : ""}</div>
            <div class="small">Selecione uma obra para ver blocos e apartamentos.</div>
          </div>
          <div class="row" style="gap:8px">
            <button id="btnDash" class="btn">Dashboard</button>
            ${canManageObras(u) ? `<button id="btnAddObra" class="btn btn--orange">+ Adicionar obra</button>` : ``}
            ${canManageUsers(u) ? `<button id="btnUsers" class="btn">Usuários</button>` : ``}
          </div>
        </div>
        <div class="hr"></div>

        <table class="table">
          <thead>
            <tr>
              <th>Obra</th>
              <th style="text-align:center">Qtd aptos</th>
              <th style="text-align:center">Sem vistoria</th>
              <th style="text-align:center">Com pendência</th>
              <th style="text-align:center">Aguardando conferência</th>
              <th style="text-align:center">Conferido</th>
              <th style="text-align:center">Concluído</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${cityFilter ? renderSection(cityLabel(cityFilter), obrasVisiveis) : grouped.map(g => renderSection(cityLabel(g.city), g.arr)).join("")}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="h2">Fluxo</div>
        <div class="small">Funcionamento do checklist</div>
        <div class="hr"></div>
        <div class="small">
          <b>1.</b> Qualidade/Supervisor cria pendência<br><br>
          <b>2.</b> Execução marca como feito<br><br>
          <b>3.</b> Qualidade marca conferido<br><br>
          <b>4.</b> Supervisor aprova = concluído
        </div>
      </div>
    </div>
  `;

  $("#btnDash").onclick = ()=> goto("dash", cityFilter ? { city: cityFilter } : {});
  const usersBtn = $("#btnUsers");
  if(usersBtn) usersBtn.onclick = ()=> goto("users");

  const addBtn = $("#btnAddObra");
  if(addBtn){
    addBtn.onclick = ()=>{
      const { backdrop, close } = openModal(`
        <div class="modal">
          <div class="row">
            <div><div class="h2">Adicionar obra</div></div>
            <button class="btn btn--ghost" id="mClose">✕</button>
          </div>
          <div class="hr"></div>
          <div class="grid">
            <div><div class="small">Nome da obra</div><input id="mObraNome" class="input" placeholder="Ex.: Costa Azul" /></div>
            <div><div class="small">ID da obra (opcional)</div><input id="mObraId" class="input" placeholder="Ex.: costa_azul" /></div>
            <div><div class="small">Criar login da Execução</div><input id="mExecUser" class="input" placeholder="Ex.: exec_costa_azul" /></div>
            <div><div class="small">PIN da Execução</div><input id="mExecPin" class="input" maxlength="4" placeholder="Ex.: 1234" /></div>
            <div><div class="small">Quantidade de blocos</div><input id="mBlocos" class="input" placeholder="Ex.: 6" /></div>
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
                <option value="formosa">Formosa</option>
              </select>
            </div>
            <div class="row" style="justify-content:flex-end"><button id="mAddObra" class="btn btn--orange">Adicionar</button></div>
          </div>
        </div>
      `);

      $("#mClose", backdrop).onclick = close;
      $("#mAddObra", backdrop).onclick = async ()=>{
        const name = ($("#mObraNome", backdrop).value || "").trim();
        const customId = ($("#mObraId", backdrop).value || "").trim();
        const execUser = ($("#mExecUser", backdrop).value || "").trim().toLowerCase();
        const execPin = ($("#mExecPin", backdrop).value || "").trim();
        const blocks = Number(($("#mBlocos", backdrop).value || "").trim());
        const apts = Number(($("#mAptos", backdrop).value || "12").trim());
        const city = ($("#mCidade", backdrop).value || "valparaiso").trim();

        if(!name) return toast("Informe o nome da obra.");
        if(!blocks || blocks < 1) return toast("Informe a quantidade de blocos.");

        const finalId = customId ? slugify(customId) : slugify(name);
        const r = addObra(finalId, name, blocks, apts, city, execUser, execPin);
        if(!r.ok) return toast(r.msg || "Falha ao adicionar obra.");

        try{
          persistLocal();
          await saveMetaNowToFirestore();
        }catch(e){
          console.error(e);
          saveState();
        }
        close();
        renderHome(root);
        toast("Obra criada.");
      };
    };
  }

  $$("button[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      const obraId = btn.getAttribute("data-del");
      const obra = state.obras[obraId];
      const ok = confirm(`Apagar a obra "${obra?.name || obraId}"?`);
      if(!ok) return;
      try{
        await deleteObraAndSync(obraId);
        renderHome(root);
        toast("Obra apagada.");
      }catch(e){
        toast("Erro ao apagar obra.");
      }
    };
  });

  $$("button[data-open]").forEach(btn=>{
    btn.onclick = ()=> goto("obra", { obraId: btn.getAttribute("data-open") });
  });
}

function addObra(id, name, numBlocks, aptsPerBlock, city="valparaiso", execUser="", execPin=""){
  id = slugify(id || name);
  if(!id) return { ok:false, msg:"ID inválido." };
  if(state.obras[id]) return { ok:false, msg:"Já existe uma obra com esse ID." };

  const nb = Number(numBlocks || 0);
  const apb = Number(aptsPerBlock || 12);
  if(!nb || nb < 1) return { ok:false, msg:"Quantidade de blocos inválida." };

  if(execUser || execPin){
    if(!execUser || !execPin) return { ok:false, msg:"Informe usuário e PIN da Execução." };
    if(state.users.find(u=>u.id === execUser)) return { ok:false, msg:"Usuário já existe." };
  }

  const blocks = {};
  const nums = aptNumsByConfig(apb);

  for(let b=1;b<=nb;b++){
    const bid = "B"+b;
    const apartments = {};
    nums.forEach(n=>{
      apartments[n] = { num:n, pendencias:[], photos:[], _meta:{} };
    });
    blocks[bid] = { id:bid, apartments };
  }

  const obra = {
    id,
    name,
    city: normalizeCity(city),
    config: { numBlocks: nb, aptsPerBlock: apb },
    blocks
  };

  state.obras[id] = obra;
  state.obras_index = mergeObrasIndexLists(state.obras_index, [{
    id,
    name,
    city: obra.city,
    config: obra.config
  }]);

  if(execUser && execPin){
    state.users.push({
      id: execUser,
      name: "Execução " + name,
      role: "execucao",
      pin: String(execPin),
      obraIds: [id],
      active: true
    });
  }

  return { ok:true };
}

function deleteObra(obraId){
  delete state.obras[obraId];
  state.obras_index = state.obras_index.filter(o=>o.id !== obraId);
  state.users = state.users.filter(u => !(u.role === "execucao" && (u.obraIds || []).includes(obraId)));
  if(nav.params && nav.params.obraId === obraId){
    nav.screen = canViewOnly(currentUser() || {}) ? "dash" : "home";
    nav.params = {};
  }
}

async function deleteObraAndSync(obraId){
  const obra = state.obras[obraId];
  deleteObra(obraId);
  persistLocal();
  try{
    if(fbReady && obra){
      let batch = fbDb.batch();
      let opCount = 0;
      for(const block of Object.values(obra.blocks || {})){
        for(const apto of Object.keys(block.apartments || {})){
          const ref = fbDb.collection("apps").doc("bela_mares_checklist").collection(APARTMENTS_COLLECTION).doc(makeAptDocId(obraId, block.id, apto));
          batch.delete(ref);
          opCount++;
          if(opCount >= 400){
            await batch.commit();
            batch = fbDb.batch();
            opCount = 0;
          }
        }
      }
      if(opCount > 0) await batch.commit();
      await saveMetaNowToFirestore();
    } else {
      saveState();
    }
  }catch(e){
    console.error("Erro ao apagar obra:", e);
    saveState();
    throw e;
  }
}

function pushEvent(p, type, u, extra){
  if(!p.events) p.events = [];
  p.events.push(Object.assign({
    type,
    at: new Date().toISOString(),
    by: u ? { id:u.id, name:u.name, role:u.role } : null
  }, extra || {}));
}

function fmtEvent(ev){
  const who = ev.by ? `${ev.by.name} (${ev.by.role})` : "-";
  const at = fmtDT(ev.at);
  if(ev.type==="criado") return `Criado: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="feito") return `Feito: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="conferido") return `Conferido: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="aprovado") return `Aprovado: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="reprovado") return `Reprovado: <b>${at}</b> por <b>${esc(who)}</b>${ev.note ? " — " + esc(ev.note) : ""}`;
  if(ev.type==="reaberto") return `Reaberto: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="editado") return `Editado: <b>${at}</b> por <b>${esc(who)}</b>`;
  if(ev.type==="apagado") return `Apagado: <b>${at}</b> por <b>${esc(who)}</b>`;
  return `${esc(ev.type)} — ${at}`;
}


function formatDateShort(iso){
  if(!iso) return "";
  try{
    const d = new Date(iso);
    const pad = n => String(n).padStart(2,"0");
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }catch(e){
    return "";
  }
}

function buildHistoricoPDF(p){
  const parts = [];
  if(p.createdAt) parts.push(`criado ${formatDateShort(p.createdAt)}`);
  if(p.doneAt) parts.push(`feito ${formatDateShort(p.doneAt)}`);
  if(p.reviewedAt){
    if(p.state === "reprovado" && p.reviewedBy?.role === "qualidade") parts.push(`reprovado pela qualidade ${formatDateShort(p.reviewedAt)}`);
    else parts.push(`conferido pela qualidade ${formatDateShort(p.reviewedAt)}`);
  }
  if(p.approvedAt){
    if(p.state === "reprovado") parts.push(`reprovado pelo supervisor ${formatDateShort(p.approvedAt)}`);
    else parts.push(`concluído pelo supervisor ${formatDateShort(p.approvedAt)}`);
  }
  return parts.join(" | ");
}

function getStatusPDF(p){
  if(p.state === "pendente") return "PENDENTE";
  if(p.state === "feito") return "FEITO - AGUARDANDO CONFERÊNCIA QUALIDADE";
  if(p.state === "conferido") return "FEITO - CONFERIDO PELA QUALIDADE";
  if(p.state === "concluido") return "CONCLUÍDO - CONFERIDO PELO SUPERVISOR";
  if(p.state === "reprovado") return "PENDENTE";
  return String(p.state || "").toUpperCase();
}

function getObsPDF(p){
  if(p.state !== "reprovado") return "";
  if(p.reviewedBy?.role === "qualidade") return "Obs: reprovado pela QUALIDADE";
  return "Obs: reprovado pelo SUPERVISOR";
}

function gerarPDFObra(obraId){
  const obra = state.obras[obraId];
  if(!obra) return;
  const blocks = Object.values(obra.blocks || {}).sort((a,b)=>Number(String(a.id).replace("B","")) - Number(String(b.id).replace("B","")));
  let html = `
    <html><head><meta charset="utf-8">
    <title>${esc(obra.name)} - PDF</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}
      .page{page-break-after:always}
      .header{margin-bottom:16px}
      .company{font-size:18px;font-weight:700}
      .obra{font-size:20px;font-weight:700;margin-top:4px}
      .meta{margin:4px 0}
      .item{margin:0 0 14px 0;line-height:1.45}
      .status{font-weight:400}
      .hist{font-size:12px;color:#333}
    </style></head><body>`;
  let pages = 0;
  blocks.forEach(block=>{
    const apts = Object.keys(block.apartments || {}).sort((a,b)=>Number(a)-Number(b));
    apts.forEach(apto=>{
      const apt = block.apartments[apto];
      const pendencias = (apt.pendencias || []);
      if(!pendencias.length) return;
      pages++;
      html += `
        <div class="page">
          <div class="header">
            <div class="company">Bela Mares Incorporações</div>
            <div class="obra">${esc(obra.name)}</div>
            <div class="meta">Bloco: ${esc(block.id)}</div>
            <div class="meta">Apartamento: ${esc(apto)}</div>
          </div>`;
      pendencias.forEach(p=>{
        const loc = p.location ? ` (${esc(p.location)})` : "";
        const obs = getObsPDF(p);
        const hist = buildHistoricoPDF(p);
        html += `
          <div class="item">
            - ${esc(p.title || "Pendência")}${loc}<br>
            <span class="status">Status: ${esc(getStatusPDF(p))}</span><br>
            ${obs ? `${esc(obs)}<br>` : ``}
            ${hist ? `<span class="hist">Histórico: ${esc(hist)}</span>` : ``}
          </div>`;
      });
      html += `</div>`;
    });
  });
  html += `</body></html>`;
  if(!pages) return toast("Não há apartamentos com pendências para gerar PDF.");
  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(()=>w.print(), 300);
}

function gerarPDFResumoDashboard(u, city){
  const cities = city ? [normalizeCity(city)] : ["valparaiso","aguaslindas","formosa"].filter(c => obrasByCityForUser(u, c).length || ["diretor","engenheiro","supervisor"].includes(u.role));
  let html = `
    <html><head><meta charset="utf-8">
    <title>Resumo Geral</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}
      .company{font-size:18px;font-weight:700}
      .title{font-size:20px;font-weight:700;margin:4px 0 18px}
      table{width:100%;border-collapse:collapse;margin:12px 0 28px}
      th,td{border:1px solid #333;padding:8px 10px;font-size:12px}
      th{text-align:left;background:#f3f4f6}
      h2{margin:20px 0 8px}
      .sum{margin:8px 0 14px;font-size:13px}
    </style></head><body>
    <div class="company">Bela Mares Incorporações</div>
    <div class="title">Resumo Geral de Obras</div>`;
  cities.forEach(c=>{
    const obras = obrasByCityForUser(u, c).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id), "pt-BR"));
    const s = cityStatsFromObras(obras);
    html += `<h2>${cityLabel(c)}</h2>
      <div class="sum">Obras: ${s.obras} | Aptos: ${s.total} | Sem vistoria: ${s.semVistoria} | Pendência: ${s.pend} | Aguardando conferência: ${s.aguard} | Conferido: ${s.conferido} | Concluído: ${s.conclu}</div>
      <table>
        <thead><tr><th>Obra</th><th>Qtd aptos</th><th>Sem vistoria</th><th>Pendência</th><th>Aguardando conferência</th><th>Conferido</th><th>Concluído</th></tr></thead>
        <tbody>
          ${obras.map(o=>{
            const os = calcObraStats(o.id);
            return `<tr><td>${esc(o.name || o.id)}</td><td>${os.total}</td><td>${os.semVistoria}</td><td>${os.pend}</td><td>${os.aguard}</td><td>${os.conferido}</td><td>${os.conclu}</td></tr>`;
          }).join("")}
        </tbody>
      </table>`;
  });
  html += `</body></html>`;
  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(()=>w.print(), 300);
}


async function syncAptAndRefresh(obraId, blockId, apto, onDone, successMsg){
  try{
    saveState();
    await saveApartmentNowToFirestore(obraId, blockId, apto);
    await saveMetaNowToFirestore();
    if(typeof onDone === "function") onDone();
    if(successMsg) toast(successMsg);
  }catch(e){
    console.error(e);
    toast("Erro ao sincronizar.");
  }
}

function renderAptoDetalhe(root){
  const u = currentUser();
  const { obraId, blockId, apto } = nav.params;
  const obra = state.obras[obraId];
  const apt = getOrMakeApartment(obraId, blockId, apto);

  root.innerHTML = `
    <div class="grid2">
      <div class="card">
        <div class="row">
          <div>
            <div class="h1">${esc(obra.name)} • ${esc(blockId)} • ${esc(apto)}</div>
            <div class="small">Pendências do apartamento</div>
          </div>
          <div class="row" style="gap:8px">
            ${canCreate(u) ? `<button id="btnAddPend" class="btn btn--orange">+ Pendência</button>` : ``}
          </div>
        </div>
        <div class="hr"></div>

        <div class="grid">
          ${(apt.pendencias || []).map(p=>`
            <div class="card">
              <div class="row">
                <div>
                  <div><b>${esc(p.title || "-")}</b></div>
                  <div class="small">${esc(p.category || "-")} • ${esc(p.location || "-")}</div>
                </div>
                <div class="badge" style="${statusBadgeStyle(p.state)}">${esc(statusLabel(p.state))}</div>
              </div>

              ${p.rejection ? `<div class="small" style="margin-top:8px"><b>Motivo:</b> ${esc(p.rejection)}</div>` : ``}
              <div class="hr"></div>

              <div class="row" style="gap:8px;flex-wrap:wrap">
                ${canMarkDone(u) && (p.state==="pendente" || p.state==="reprovado") ? `<button class="btn" data-done="${esc(p.id)}">Marcar feito</button>` : ``}
                ${canQualityReview(u) && p.state==="feito" ? `<button class="btn btn--orange" data-quality-ok="${esc(p.id)}">Conferir</button>` : ``}
                ${canQualityReview(u) && p.state==="feito" ? `<button class="btn btn--red" data-quality-reprov="${esc(p.id)}">Reprovar</button>` : ``}
                ${canSupervisorApprove(u) && p.state==="conferido" ? `<button class="btn btn--orange" data-super-ok="${esc(p.id)}">Aprovar</button>` : ``}
                ${canSupervisorApprove(u) && p.state==="conferido" ? `<button class="btn btn--red" data-super-reprov="${esc(p.id)}">Reprovar</button>` : ``}
                ${canReopen(u) && (p.state==="conferido" || p.state==="concluido") ? `<button class="btn" data-reopen="${esc(p.id)}">Reabrir</button>` : ``}
                ${canCreate(u) ? `<button class="btn" data-edit="${esc(p.id)}">Editar</button>` : ``}
                ${canCreate(u) ? `<button class="btn btn--red" data-del="${esc(p.id)}">Apagar</button>` : ``}
              </div>

              <div class="hr"></div>
              <div class="small">${(p.events || []).map(ev=>fmtEvent(ev)).join("<br>")}</div>
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
            <div><div class="h2">Nova pendência</div><div class="small">${esc(obra.name)} • ${esc(blockId)} • ${esc(apto)}</div></div>
            <button class="btn btn--ghost" id="mClose">✕</button>
          </div>
          <div class="hr"></div>
          <div class="grid">
            <div><div class="small">Descrição</div><input id="mTitle" class="input" placeholder="Ex.: Pintura com falha" /></div>
            <div><div class="small">Categoria</div><input id="mCat" class="input" placeholder="Ex.: Pintura" /></div>
            <div><div class="small">Local</div><input id="mLoc" class="input" placeholder="Ex.: Sala" /></div>
            <div class="row" style="justify-content:flex-end"><button id="mCreate" class="btn btn--orange">Adicionar</button></div>
          </div>
        </div>
      `);

      $("#mClose", backdrop).onclick = close;
      $("#mCreate", backdrop).onclick = async ()=>{
        const title = ($("#mTitle", backdrop).value || "").trim();
        const category = ($("#mCat", backdrop).value || "").trim();
        const location = ($("#mLoc", backdrop).value || "").trim();
        if(!title) return toast("Informe a descrição.");

        const p = {
          id: uid("p"),
          title,
          category,
          location,
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
        apt._meta.updatedAtMs = Date.now();

        syncAptAndRefresh(
          obraId, blockId, apto,
          ()=>{
            close();
            renderAptoDetalhe(root);
          },
          "Pendência adicionada."
        );
      };
    };
  }

  $$('[data-done]').forEach(btn=>{
    btn.onclick = ()=>{
      const p = apt.pendencias.find(x=>x.id === btn.getAttribute("data-done"));
      if(!p) return;
      p.state = "feito";
      p.doneAt = new Date().toISOString();
      p.doneBy = currentUser() ? { id:currentUser().id, name:currentUser().name, role:currentUser().role } : null;
      p.reviewedAt = null;
      p.reviewedBy = null;
      p.approvedAt = null;
      p.approvedBy = null;
      p.rejection = null;
      p.updatedAt = new Date().toISOString();
      pushEvent(p, "feito", currentUser());
      apt._meta.updatedAtMs = Date.now();

      syncAptAndRefresh(obraId, blockId, apto, ()=>renderAptoDetalhe(root), "Marcado como feito.");
    };
  });

  $$('[data-quality-ok]').forEach(btn=>{
    btn.onclick = ()=>{
      const p = apt.pendencias.find(x=>x.id === btn.getAttribute("data-quality-ok"));
      if(!p) return;
      p.state = "conferido";
      p.reviewedAt = new Date().toISOString();
      p.reviewedBy = currentUser() ? { id:currentUser().id, name:currentUser().name, role:currentUser().role } : null;
      p.approvedAt = null;
      p.approvedBy = null;
      p.updatedAt = new Date().toISOString();
      pushEvent(p, "conferido", currentUser());
      apt._meta.updatedAtMs = Date.now();

      syncAptAndRefresh(obraId, blockId, apto, ()=>renderAptoDetalhe(root), "Conferido.");
    };
  });

  $$('[data-quality-reprov]').forEach(btn=>{
    btn.onclick = ()=>{
      const p = apt.pendencias.find(x=>x.id === btn.getAttribute("data-quality-reprov"));
      if(!p) return;
      const note = prompt("Motivo da reprovação:", p.rejection || "");
      if(note === null) return;
      p.state = "reprovado";
      p.rejection = (note || "").trim();
      p.reviewedAt = new Date().toISOString();
      p.reviewedBy = currentUser() ? { id:currentUser().id, name:currentUser().name, role:currentUser().role } : null;
      p.approvedAt = null;
      p.approvedBy = null;
      p.updatedAt = new Date().toISOString();
      pushEvent(p, "reprovado", currentUser(), { note: p.rejection });
      apt._meta.updatedAtMs = Date.now();

      syncAptAndRefresh(obraId, blockId, apto, ()=>renderAptoDetalhe(root), "Reprovado.");
    };
  });

  $$('[data-super-ok]').forEach(btn=>{
    btn.onclick = ()=>{
      const p = apt.pendencias.find(x=>x.id === btn.getAttribute("data-super-ok"));
      if(!p) return;
      p.state = "concluido";
      p.approvedAt = new Date().toISOString();
      p.approvedBy = currentUser() ? { id:currentUser().id, name:currentUser().name, role:currentUser().role } : null;
      p.updatedAt = new Date().toISOString();
      pushEvent(p, "aprovado", currentUser());
      apt._meta.updatedAtMs = Date.now();

      syncAptAndRefresh(obraId, blockId, apto, ()=>renderAptoDetalhe(root), "Aprovado.");
    };
  });

  $$('[data-super-reprov]').forEach(btn=>{
    btn.onclick = ()=>{
      const p = apt.pendencias.find(x=>x.id === btn.getAttribute("data-super-reprov"));
      if(!p) return;
      const note = prompt("Motivo da reprovação:", p.rejection || "");
      if(note === null) return;
      p.state = "reprovado";
      p.rejection = (note || "").trim();
      p.approvedAt = null;
      p.approvedBy = null;
      p.updatedAt = new Date().toISOString();
      pushEvent(p, "reprovado", currentUser(), { note: p.rejection });
      apt._meta.updatedAtMs = Date.now();

      syncAptAndRefresh(obraId, blockId, apto, ()=>renderAptoDetalhe(root), "Reprovado.");
    };
  });

  $$('[data-reopen]').forEach(btn=>{
    btn.onclick = ()=>{
      const p = apt.pendencias.find(x=>x.id === btn.getAttribute("data-reopen"));
      if(!p) return;
      p.state = "pendente";
      p.reopenedAt = new Date().toISOString();
      p.reviewedAt = null;
      p.reviewedBy = null;
      p.approvedAt = null;
      p.approvedBy = null;
      p.updatedAt = new Date().toISOString();
      pushEvent(p, "reaberto", currentUser());
      apt._meta.updatedAtMs = Date.now();

      syncAptAndRefresh(obraId, blockId, apto, ()=>renderAptoDetalhe(root), "Reaberto.");
    };
  });

  $$('[data-edit]').forEach(btn=>{
    btn.onclick = ()=>{
      const p = apt.pendencias.find(x=>x.id === btn.getAttribute("data-edit"));
      if(!p) return;
      const title = prompt("Editar descrição:", p.title || "");
      if(title === null) return;
      p.title = title.trim();
      p.updatedAt = new Date().toISOString();
      pushEvent(p, "editado", currentUser());
      apt._meta.updatedAtMs = Date.now();

      syncAptAndRefresh(obraId, blockId, apto, ()=>renderAptoDetalhe(root), "Editado.");
    };
  });

  $$('[data-del]').forEach(btn=>{
    btn.onclick = ()=>{
      const idx = apt.pendencias.findIndex(x=>x.id === btn.getAttribute("data-del"));
      if(idx < 0) return;
      const p = apt.pendencias[idx];
      pushEvent(p, "apagado", currentUser());
      apt.pendencias.splice(idx, 1);
      apt._meta.updatedAtMs = Date.now();

      syncAptAndRefresh(obraId, blockId, apto, ()=>renderAptoDetalhe(root), "Apagado.");
    };
  });
}


function renderObra(root){
  const u = currentUser();
  if(!u) return goto("login");

  const obraId = nav.params.obraId;
  const obra = state.obras[obraId];
  if(!obra){
    toast("Obra não encontrada.");
    return goto(canViewOnly(u) ? "dash" : "home");
  }

  if(!canAccessObra(u, obraId)){
    toast("Sem acesso a essa obra.");
    return goto(canViewOnly(u) ? "dash" : "home");
  }

  const blocks = Object.values(obra.blocks || {}).sort((a,b)=>
    Number(String(a.id).replace("B","")) - Number(String(b.id).replace("B",""))
  );
  const cfg = obra.config || { numBlocks: blocks.length || 0, aptsPerBlock: 12 };

  root.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
            <div class="h1">${esc(obra.name || obra.id || "Obra")}</div>
            <span class="badge" style="background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#fff;border:none;text-transform:uppercase">${cityLabel(obra.city)}</span>
          </div>
          <div class="small">${cfg.numBlocks || "-"} blocos • ${cfg.aptsPerBlock || "-"} apto/bloco</div>
        </div>
        <div class="row" style="gap:8px">
          ${["supervisor","diretor","engenheiro","coordenador"].includes(u.role) ? `<button id="btnPDFObra" class="btn">Gerar PDF</button>` : ``}
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

  const btnPDFObra = $("#btnPDFObra");
  if(btnPDFObra) btnPDFObra.onclick = ()=> gerarPDFObra(obraId);

  $$('[data-open-block]').forEach(btn=>{
    btn.onclick = ()=> goto("apto", { obraId, blockId: btn.getAttribute("data-open-block") });
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

  if(nav.params.apto){
    return renderAptoDetalhe(root);
  }

  const aptNums = aptNumsForBlock(obra, block);

  root.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="h1">${esc(obra.name)} • ${esc(blockId)}</div>
          <div class="small">Cidade: ${cityLabel(obra.city)} • Selecione o apartamento</div>
        </div>
      </div>
      <div class="hr"></div>

      <div class="grid apt-grid">
        ${aptNums.map(an=>{
          const a = getOrMakeApartment(obraId, blockId, an);
          const ps = a.pendencias || [];
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
    btn.onclick = ()=> goto("apto", { obraId, blockId, apto: btn.getAttribute("data-open-apt") });
  });
}

function renderUsers(root){
  const u = currentUser();
  if(!u) return goto("login");
  if(!canManageUsers(u) && !canViewOnly(u)) return goto("home");

  const users = (state.users || []).filter(x=>x && x.active);
  root.innerHTML = `
    <div class="card">
      <div class="row">
        <div><div class="h1">Usuários</div><div class="small">Gerencie logins</div></div>
        <div class="row" style="gap:8px">
          <button id="btnBackUsers" class="btn">Voltar</button>
          ${canCreateSupervisor(u) ? `<button id="btnAddSup" class="btn btn--orange">+ Supervisor</button>` : ``}
        </div>
      </div>
      <div class="hr"></div>

      <table class="table">
        <thead>
          <tr><th>Usuário</th><th>Nome</th><th>Perfil</th><th>Acesso</th><th>PIN</th></tr>
        </thead>
        <tbody>
          ${users.map(x=>{
            const access = ["qualidade","coordenador"].includes(x.role)
              ? userCities(x).map(cityLabel).join(", ")
              : ((x.obraIds || [])[0] === "*" ? "Todas" : (x.obraIds || []).join(", "));
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
    </div>
  `;

  $("#btnBackUsers").onclick = ()=> goto(canViewOnly(u) ? "dash" : "home");

  const btnAddSup = $("#btnAddSup");
  if(btnAddSup){
    btnAddSup.onclick = ()=>{
      const { backdrop, close } = openModal(`
        <div class="modal">
          <div class="row">
            <div><div class="h2">Novo supervisor</div></div>
            <button class="btn btn--ghost" id="mClose">✕</button>
          </div>
          <div class="hr"></div>
          <div class="grid">
            <div><div class="small">Usuário</div><input id="mUser" class="input" placeholder="Ex.: supervisor_02" /></div>
            <div><div class="small">Nome</div><input id="mName" class="input" placeholder="Ex.: Supervisor 02" /></div>
            <div><div class="small">PIN</div><input id="mPin" class="input" maxlength="4" placeholder="Ex.: 4444" /></div>
            <div class="row" style="justify-content:flex-end"><button id="mCreate" class="btn btn--orange">Criar</button></div>
          </div>
        </div>
      `);

      $("#mClose", backdrop).onclick = close;
      $("#mCreate", backdrop).onclick = async ()=>{
        const id = ($("#mUser", backdrop).value || "").trim().toLowerCase();
        const name = ($("#mName", backdrop).value || "").trim();
        const pin = ($("#mPin", backdrop).value || "").trim();

        if(!id || !name || !pin) return toast("Preencha usuário, nome e PIN.");
        if(state.users.find(x=>x.id === id)) return toast("Usuário já existe.");

        state.users.push({ id, name, role:"supervisor", pin, obraIds:["*"], active:true });
        try{
          persistLocal();
          await saveMetaNowToFirestore();
        }catch(e){
          console.error(e);
          saveState();
        }
        close();
        renderUsers(root);
        toast("Supervisor criado.");
      };
    };
  }
}

function renderSettings(root){
  const u = currentUser();
  if(!canResetData(u)) return goto("home");

  root.innerHTML = `
    <div class="card">
      <div class="h1">Configurações</div>
      <div class="small">Área restrita ao supervisor.</div>
      <div class="hr"></div>

      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button id="btnExport" class="btn">Exportar JSON</button>
        <button id="btnImport" class="btn">Importar JSON</button>
        <button id="btnReset" class="btn btn--red">Resetar dados</button>
      </div>

      <input id="importFile" type="file" accept=".json,application/json" style="display:none" />
    </div>
  `;

  $("#btnExport").onclick = ()=>{
    const blob = new Blob([JSON.stringify(persistableState(), null, 2)], { type:"application/json" });
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
      if(!parsed || typeof parsed !== "object") return toast("Arquivo inválido.");
      if(parsed.session) delete parsed.session;
      parsed.version = STATE_VERSION;
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
    const ok = confirm("Resetar dados locais?");
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
persistLocal();
initFirestore();
render();
    
