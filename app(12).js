const APP_VERSION = "live-sync-v4";
const STATE_VERSION = 31;

/* Bela Mares — Checklist */
/* Base com Firebase compat e sync ao vivo restaurado */

const STORAGE_KEY = "bm_checklist_classic_v1";
let localSaveDisabled = false;

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

function persistableStateForLocal(){
  const s = persistableState();
  try{ stripLargeFields(s); }catch(_){}
  return s;
}

const SESSION_KEY = "bm_checklist_session_user";
function getSessionUserId(){
  try{ return (localStorage.getItem(SESSION_KEY) || "").trim().toLowerCase(); }catch(e){ return ""; }
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
  toastTimer = setTimeout(()=>{ el.style.display="none"; }, 2600);
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

function slugify(input){
  try{
    return String(input || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9]+/g,"_")
      .replace(/^_+|_+$/g,"");
  }catch(e){
    return String(input || "").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  }
}

function normalizeCity(v){
  const s = String(v || "").trim().toLowerCase();
  if(s.includes("aguas") || s.includes("águas")) return "aguaslindas";
  return "valparaiso";
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
  if(!aIso || !bIso) return "-";
  try{
    const a = new Date(aIso).getTime();
    const b = new Date(bIso).getTime();
    const m = Math.max(0, Math.round((b-a)/60000));
    const h = Math.floor(m/60), mm = m % 60;
    return `${h}h${String(mm).padStart(2,"0")}`;
  }catch(e){
    return "-";
  }
}

function readImageAsDataURL(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(String(r.result || ""));
    r.onerror = ()=> reject(r.error || new Error("Falha ao ler imagem"));
    r.readAsDataURL(file);
  });
}

function uid(prefix="id"){
  return prefix + "_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

const APT_NUMS_12 = ["101","102","103","104","201","202","203","204","301","302","303","304"];
const APT_NUMS_16 = ["101","102","103","104","201","202","203","204","301","302","303","304","401","402","403","404"];

function aptNumsByConfig(aptsPerBlock){
  return Number(aptsPerBlock) === 12 ? APT_NUMS_12 : APT_NUMS_16;
}

function aptNumsForBlock(obra, block){
  const configured = aptNumsByConfig(obra?.config?.aptsPerBlock || 16);
  const existing = Object.keys(block?.apartments || {}).sort((a,b)=> Number(a)-Number(b));
  if(!existing.length) return configured;
  const all = new Set([...configured, ...existing]);
  return Array.from(all).sort((a,b)=> Number(a)-Number(b));
}

function makeEmptyApartment(num){
  return {
    num: String(num),
    pendencias: [],
    photos: []
  };
}

function getOrMakeApartment(obraId, blockId, aptNum){
  const obra = state.obras[obraId];
  if(!obra) return null;

  if(!obra.blocks) obra.blocks = {};
  if(!obra.blocks[blockId]) obra.blocks[blockId] = { id:blockId, apartments:{} };

  const block = obra.blocks[blockId];
  if(!block.apartments) block.apartments = {};

  const an = String(aptNum);
  if(!block.apartments[an]){
    block.apartments[an] = makeEmptyApartment(an);
  }
  return block.apartments[an];
}

function getApartmentView(obraId, blockId, aptNum){
  const obra = state.obras[obraId];
  const block = obra?.blocks?.[blockId];
  const an = String(aptNum);
  return (block?.apartments && block.apartments[an])
    ? block.apartments[an]
    : makeEmptyApartment(an);
}

function seed(){
  const s = {
    version: STATE_VERSION,
    session: null,
    users: [
      { id:"supervisor_01", name:"Supervisor 01", role:"supervisor", pin:"3333", obraIds:["*"], active:true, cityScope:"*" },
      { id:"qualidade_valparaiso", name:"Qualidade Valparaíso", role:"qualidade", pin:"2222", obraIds:[], active:true, cityScope:"valparaiso" },
      { id:"qualidade_aguaslindas", name:"Qualidade Águas Lindas", role:"qualidade", pin:"2233", obraIds:[], active:true, cityScope:"aguaslindas" },
      { id:"exec_costa_rica", name:"Execução Costa Rica", role:"execucao", pin:"1234", obraIds:["costa_rica"], active:true },
      { id:"exec_costa_brava", name:"Execução Costa Brava", role:"execucao", pin:"5678", obraIds:["costa_brava"], active:true },
      { id:"coordenador", name:"Coordenador", role:"coordenador", pin:"7777", obraIds:["*"], active:true, cityScope:"*" },
      { id:"engenheiro", name:"Engenheiro Geral", role:"engenheiro", pin:"8888", obraIds:["*"], active:true, cityScope:"*" },
      { id:"diretor", name:"Diretor", role:"diretor", pin:"9999", obraIds:["*"], active:true, cityScope:"*" },
    ],
    obras: {},
    obras_index: [],
    last_obras_refresh: new Date().toISOString(),
    _meta: {
      deletedObraIds: [],
      deletedExecIds: []
    }
  };

  function makeObra(id, name, numBlocks, aptsPerBlock, city="valparaiso"){
    const blocks = {};
    for(let b=1;b<=numBlocks;b++){
      const bid = "B"+b;
      blocks[bid] = { id: bid, apartments: {} };
    }
    s.obras[id] = {
      id,
      name,
      city,
      config: { numBlocks, aptsPerBlock },
      blocks
    };
    s.obras_index.push({
      id,
      name,
      city,
      config: { numBlocks, aptsPerBlock }
    });
  }

  makeObra("costa_rica", "Costa Rica - Entregas", 17, 12, "valparaiso");
  makeObra("costa_brava", "Costa Brava - Entregas", 6, 12, "valparaiso");

  const apt = getOrMakeApartment("costa_rica", "B17", "204");
  apt.pendencias.push({
    id: uid("p"),
    title: "Rejunte falhando",
    category: "Revestimento",
    location: "Cozinha",
    state: "pendente",
    createdAt: new Date().toISOString(),
    createdBy: { id:"qualidade_valparaiso", name:"Qualidade Valparaíso", role:"qualidade" },
    doneAt:null,
    doneBy:null,
    reviewedAt:null,
    reviewedBy:null,
    rejection:null,
    reopenedAt:null,
    photos:[]
  });

  return s;
}

function migrateState(s){
  if(!s || typeof s !== "object") s = seed();

  if(!s.version) s.version = 1;
  if(!Array.isArray(s.users)) s.users = [];
  if(!s.obras || typeof s.obras !== "object") s.obras = {};
  if(!Array.isArray(s.obras_index)) s.obras_index = [];
  if(!s.last_obras_refresh) s.last_obras_refresh = new Date().toISOString();
  if(!s._meta) s._meta = {};
  if(!Array.isArray(s._meta.deletedObraIds)) s._meta.deletedObraIds = [];
  if(!Array.isArray(s._meta.deletedExecIds)) s._meta.deletedExecIds = [];

  Object.values(s.obras).forEach(obra=>{
    if(!obra.city) obra.city = "valparaiso";
    obra.city = normalizeCity(obra.city);
    if(!obra.config){
      obra.config = {
        numBlocks: Object.keys(obra.blocks || {}).length || 1,
        aptsPerBlock: 16
      };
    }
    if(!obra.blocks) obra.blocks = {};
    Object.values(obra.blocks).forEach(block=>{
      if(!block.apartments) block.apartments = {};
    });
  });

  s.obras_index = s.obras_index
    .filter(x => !!x && !!x.id)
    .map(x => ({
      ...x,
      city: normalizeCity(x.city || s.obras[x.id]?.city || "valparaiso"),
      config: x.config || s.obras[x.id]?.config || { numBlocks:1, aptsPerBlock:16 }
    }));

  s.users = s.users.map(u=>{
    const next = { ...u };
    if(typeof next.active !== "boolean") next.active = true;
    if(!Array.isArray(next.obraIds)) next.obraIds = [];
    if(next.role === "qualidade"){
      if(next.id === "qualidade_valparaiso") next.cityScope = "valparaiso";
      else if(next.id === "qualidade_aguaslindas") next.cityScope = "aguaslindas";
      else next.cityScope = next.cityScope || "*";
    }
    if(["supervisor","coordenador","engenheiro","diretor"].includes(next.role)){
      next.cityScope = "*";
    }
    return next;
  });

  s.version = STATE_VERSION;
  return s;
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return seed();
    const parsed = JSON.parse(raw);
    if(!parsed || !parsed.version) return seed();
    if(parsed.session) delete parsed.session;
    return migrateState(parsed);
  }catch(e){
    return seed();
  }
}

let state = loadState();

function ensureSystemDefaults(){
  state = migrateState(state);

  const fixed = [
    { id:"supervisor_01", name:"Supervisor 01", role:"supervisor", pin:"3333", obraIds:["*"], active:true, cityScope:"*" },
    { id:"qualidade_valparaiso", name:"Qualidade Valparaíso", role:"qualidade", pin:"2222", obraIds:[], active:true, cityScope:"valparaiso" },
    { id:"qualidade_aguaslindas", name:"Qualidade Águas Lindas", role:"qualidade", pin:"2233", obraIds:[], active:true, cityScope:"aguaslindas" },
    { id:"coordenador", name:"Coordenador", role:"coordenador", pin:"7777", obraIds:["*"], active:true, cityScope:"*" },
    { id:"engenheiro", name:"Engenheiro Geral", role:"engenheiro", pin:"8888", obraIds:["*"], active:true, cityScope:"*" },
    { id:"diretor", name:"Diretor", role:"diretor", pin:"9999", obraIds:["*"], active:true, cityScope:"*" }
  ];

  fixed.forEach(f=>{
    const i = state.users.findIndex(u=>u.id===f.id);
    if(i < 0) state.users.push(f);
    else state.users[i] = { ...f, ...state.users[i], role:f.role, active:true, cityScope:f.cityScope };
  });

  Object.values(state.obras).forEach(obra=>{
    if(!obra.city) obra.city = "valparaiso";
    obra.city = normalizeCity(obra.city);
    if(!obra.config){
      obra.config = {
        numBlocks: Object.keys(obra.blocks || {}).length || 1,
        aptsPerBlock: 16
      };
    }
    if(!obra.blocks) obra.blocks = {};
    const configuredBlocks = Number(obra.config.numBlocks) || 1;
    for(let i=1;i<=configuredBlocks;i++){
      const bid = "B" + i;
      if(!obra.blocks[bid]) obra.blocks[bid] = { id:bid, apartments:{} };
      if(!obra.blocks[bid].apartments) obra.blocks[bid].apartments = {};
    }
  });

  const seen = new Set();
  state.obras_index = [
    ...state.obras_index.filter(x => !!x && !!x.id && !!state.obras[x.id]),
    ...Object.values(state.obras).map(o=>({
      id:o.id,
      name:o.name,
      city:o.city || "valparaiso",
      config:o.config || { numBlocks:1, aptsPerBlock:16 }
    }))
  ].filter(x=>{
    if(seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  }).map(x=>({
    ...x,
    city: normalizeCity(x.city),
    config: x.config || state.obras[x.id]?.config || { numBlocks:1, aptsPerBlock:16 }
  })).sort((a,b)=> a.name.localeCompare(b.name, "pt-BR"));

  try{
    const last = getSessionUserId();
    if(last){
      const u = state.users.find(x => String(x.id).toLowerCase() === last && x.active);
      if(u) state.session = { userId: u.id };
      else setSessionUserId("");
    }
  }catch(_){}
}

ensureSystemDefaults();

// ---------- Firebase compat live sync ----------
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBZuzY9l0lbgD9rf79mQ_-tbUoLWPVmN08",
  authDomain: "bela-mares-entregas.firebaseapp.com",
  projectId: "bela-mares-entregas",
  storageBucket: "bela-mares-entregas.firebasestorage.app",
  messagingSenderId: "159475494264",
  appId: "1:159475494264:web:953427de1a900f7aa3ac8d"
};

const APARTMENTS_COLLECTION = "apartments";

let fbApp = null;
let fbDb = null;
let fbReady = false;
let fbMetaUnsub = null;
let fbApartmentsUnsub = null;
let saveTimer = null;
let isApplyingRemote = false;
let legacyImportedOnce = false;

function makeAptDocId(obraId, blockId, apto){
  return `${String(obraId)}__${String(blockId)}__${String(apto)}`;
}

function ensureAptPath(obraId, blockId, apto){
  if(!state.obras) state.obras = {};
  if(!state.obras[obraId]){
    state.obras[obraId] = {
      id: obraId,
      name: obraId,
      city: "valparaiso",
      config: { numBlocks: 1, aptsPerBlock: 16 },
      blocks: {}
    };
  }
  if(!state.obras[obraId].blocks) state.obras[obraId].blocks = {};
  if(!state.obras[obraId].blocks[blockId]){
    state.obras[obraId].blocks[blockId] = { id:blockId, apartments:{} };
  }
  if(!state.obras[obraId].blocks[blockId].apartments){
    state.obras[obraId].blocks[blockId].apartments = {};
  }
  if(!state.obras[obraId].blocks[blockId].apartments[String(apto)]){
    state.obras[obraId].blocks[blockId].apartments[String(apto)] = makeEmptyApartment(apto);
  }
  return state.obras[obraId].blocks[blockId].apartments[String(apto)];
}

function applyApartmentFromDoc(doc){
  try{
    if(!doc) return;
    const obraId = doc.obraId;
    const blockId = doc.blockId;
    const apto = String(doc.apto || doc.aptNum || "");
    if(!obraId || !blockId || !apto) return;

    const target = ensureAptPath(obraId, blockId, apto);

    target.num = apto;
    target.pendencias = Array.isArray(doc.pendencias) ? doc.pendencias : [];
    target.photos = Array.isArray(doc.photos) ? doc.photos : [];

    if(!target._meta) target._meta = {};
    if(typeof doc.updatedAtMs === "number") target._meta.updatedAtMs = doc.updatedAtMs;
    target._meta.synced = true;

    if(doc.vistoriadoAt) target.vistoriadoAt = doc.vistoriadoAt;
    if(doc.checkedAt) target.checkedAt = doc.checkedAt;
    if(doc.reviewedAt) target.reviewedAt = doc.reviewedAt;
    if(typeof doc.vistoriado !== "undefined") target.vistoriado = doc.vistoriado;
    if(typeof doc.status !== "undefined") target.status = doc.status;
  }catch(e){
    console.warn("Falha ao aplicar apartment doc:", e);
  }
}

function persistableState(){
  const s = JSON.parse(JSON.stringify(state));
  if(s && s.session) delete s.session;
  return s;
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

function apartmentDataScore(a){
  if(!a) return 0;
  const pend = Array.isArray(a.pendencias) ? a.pendencias.length : 0;
  const photos = Array.isArray(a.photos) ? a.photos.length : 0;
  const marks =
    (a._meta?.synced ? 1 : 0) +
    (a._meta?.updatedAtMs ? 1 : 0) +
    (a.vistoriadoAt ? 1 : 0) +
    (a.checkedAt ? 1 : 0) +
    (a.reviewedAt ? 1 : 0) +
    (a.vistoriado ? 1 : 0) +
    ((a.status === "conferido" || a.status === "vistoriado") ? 1 : 0);

  return pend * 100 + photos * 10 + marks;
}

function mergeLegacyStateIntoCurrent(legacy){
  if(!legacy || !legacy.obras) return false;

  let changed = false;

  Object.keys(legacy.obras).forEach(obraId=>{
    const legacyObra = legacy.obras[obraId];
    if(!legacyObra) return;

    if(!state.obras[obraId]){
      state.obras[obraId] = {
        id: legacyObra.id || obraId,
        name: legacyObra.name || obraId,
        city: normalizeCity(legacyObra.city || "valparaiso"),
        config: legacyObra.config || {
          numBlocks: Object.keys(legacyObra.blocks || {}).length || 1,
          aptsPerBlock: 16
        },
        blocks: {}
      };
      changed = true;
    }

    const targetObra = state.obras[obraId];
    if(!targetObra.blocks) targetObra.blocks = {};

    Object.keys(legacyObra.blocks || {}).forEach(blockId=>{
      const legacyBlock = legacyObra.blocks[blockId];
      if(!targetObra.blocks[blockId]){
        targetObra.blocks[blockId] = { id:blockId, apartments:{} };
        changed = true;
      }

      const targetBlock = targetObra.blocks[blockId];
      if(!targetBlock.apartments) targetBlock.apartments = {};

      Object.keys(legacyBlock.apartments || {}).forEach(apto=>{
        const oldApt = legacyBlock.apartments[apto];
        const curApt = targetBlock.apartments[apto];

        if(!curApt){
          targetBlock.apartments[apto] = JSON.parse(JSON.stringify(oldApt));
          changed = true;
          return;
        }

        const curScore = apartmentDataScore(curApt);
        const oldScore = apartmentDataScore(oldApt);

        if(oldScore > curScore){
          targetBlock.apartments[apto] = JSON.parse(JSON.stringify(oldApt));
          changed = true;
        }
      });
    });
  });

  if(changed) ensureSystemDefaults();
  return changed;
}

async function loadLegacyStateFromFirestore(){
  if(!fbReady) return false;

  const candidateRefs = [
    fbDb.collection("apps").doc("bela_mares_checklist").collection("state").doc("main"),
    fbDb.collection("apps").doc("bela_mares_checklist").collection("state").doc("legacy"),
    fbDb.collection("apps").doc("bela_mares_checklist").collection("state").doc("meta_legacy")
  ];

  for(const ref of candidateRefs){
    try{
      const snap = await ref.get();
      if(!snap.exists) continue;

      const data = snap.data() || {};
      let parsed = null;

      if(data.meta && typeof data.meta === "string"){
        try{ parsed = JSON.parse(data.meta); }catch(_){}
      } else if(data.state && typeof data.state === "string"){
        try{ parsed = JSON.parse(data.state); }catch(_){}
      } else if(data.obras || data.users || data.obras_index){
        parsed = data;
      }

      if(parsed && parsed.obras){
        const changed = mergeLegacyStateIntoCurrent(parsed);
        if(changed){
          try{
            safeSetItem(STORAGE_KEY, JSON.stringify(persistableStateForLocal()));
          }catch(_){}
          render();
          return true;
        }
      }
    }catch(e){
      console.warn("Falha ao ler legado do Firestore:", e);
    }
  }

  return false;
}

async function republishAllApartmentsToSubcollection(){
  if(!fbReady) return;

  const allWrites = [];
  Object.values(state.obras || {}).forEach(obra=>{
    Object.values(obra.blocks || {}).forEach(block=>{
      const nums = aptNumsForBlock(obra, block);
      nums.forEach(apto=>{
        const apt = getApartmentView(obra.id, block.id, apto);
        if(apartmentDataScore(apt) > 0){
          allWrites.push({
            obraId: obra.id,
            blockId: block.id,
            apto: String(apto),
            apt
          });
        }
      });
    });
  });

  for(let i=0;i<allWrites.length;i+=200){
    const chunk = allWrites.slice(i, i+200);
    const batch = fbDb.batch();

    chunk.forEach(item=>{
      const ref = fbDb
        .collection("apps")
        .doc("bela_mares_checklist")
        .collection(APARTMENTS_COLLECTION)
        .doc(makeAptDocId(item.obraId, item.blockId, item.apto));

      batch.set(ref, {
        obraId: item.obraId,
        obraName: state.obras?.[item.obraId]?.name || item.obraId,
        blockId: item.blockId,
        apto: item.apto,
        pendencias: Array.isArray(item.apt.pendencias) ? item.apt.pendencias : [],
        photos: Array.isArray(item.apt.photos) ? item.apt.photos : [],
        vistoriadoAt: item.apt.vistoriadoAt || null,
        checkedAt: item.apt.checkedAt || null,
        reviewedAt: item.apt.reviewedAt || null,
        vistoriado: typeof item.apt.vistoriado !== "undefined" ? item.apt.vistoriado : null,
        status: item.apt.status || null,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        updatedAtMs: Date.now()
      }, { merge:true });
    });

    try{
      await batch.commit();
    }catch(e){
      console.warn("Falha ao republicar apartments:", e);
    }
  }
}

function initFirestore(){
  try{
    if(!window.firebase || !window.firebase.initializeApp || !window.firebase.firestore){
      console.warn("Firebase compat não encontrado. Rodando local.");
      return;
    }

    fbApp = window.firebase.apps && window.firebase.apps.length
      ? window.firebase.apps[0]
      : window.firebase.initializeApp(FIREBASE_CONFIG);

    fbDb = window.firebase.firestore();
    fbReady = true;

    const metaRef = fbDb
      .collection("apps")
      .doc("bela_mares_checklist")
      .collection("state")
      .doc("meta");

    const aptsRef = fbDb
      .collection("apps")
      .doc("bela_mares_checklist")
      .collection(APARTMENTS_COLLECTION);

    if(fbMetaUnsub) try{ fbMetaUnsub(); }catch(_){}
    if(fbApartmentsUnsub) try{ fbApartmentsUnsub(); }catch(_){}

    fbMetaUnsub = metaRef.onSnapshot((snap)=>{
      if(!snap || !snap.exists) return;
      if(snap.metadata && snap.metadata.hasPendingWrites) return;

      const data = snap.data() || {};
      if(!data.meta) return;

      try{
        isApplyingRemote = true;
        const parsed = JSON.parse(data.meta);
        if(!parsed || typeof parsed !== "object"){
          isApplyingRemote = false;
          return;
        }

        const currentSession = state?.session || null;
        parsed.version = STATE_VERSION;
        state = migrateState(parsed);
        state.session = currentSession;
        ensureSystemDefaults();

        try{
          safeSetItem(STORAGE_KEY, JSON.stringify(persistableStateForLocal()));
        }catch(_){}

        render();
      }catch(e){
        console.warn("Meta inválida no Firestore:", e);
      }finally{
        isApplyingRemote = false;
      }
    }, (err)=>console.warn("Meta snapshot error:", err));

    fbApartmentsUnsub = aptsRef.onSnapshot((qs)=>{
      if(!qs) return;
      if(qs.metadata && qs.metadata.hasPendingWrites) return;

      let changed = false;

      qs.docChanges().forEach((ch)=>{
        const data = ch.doc.data() || {};
        const obraId = data.obraId;
        const blockId = data.blockId;
        const apto = String(data.apto || data.aptNum || "");
        if(!obraId || !blockId || !apto) return;

        if(ch.type === "removed"){
          const obra = state.obras?.[obraId];
          const block = obra?.blocks?.[blockId];
          if(block?.apartments && block.apartments[apto]){
            delete block.apartments[apto];
            changed = true;
          }
          return;
        }

        applyApartmentFromDoc(data);
        changed = true;
      });

      if(changed){
        try{
          safeSetItem(STORAGE_KEY, JSON.stringify(persistableStateForLocal()));
        }catch(_){}
        render();
      }
    }, (err)=>console.warn("Apartments snapshot error:", err));

    setTimeout(async ()=>{
      if(legacyImportedOnce) return;
      legacyImportedOnce = true;

      try{
        const imported = await loadLegacyStateFromFirestore();
        if(imported){
          await republishAllApartmentsToSubcollection();
          await saveMetaToFirestore();
          try{
            safeSetItem(STORAGE_KEY, JSON.stringify(persistableStateForLocal()));
          }catch(_){}
          render();
          toast("Histórico legado restaurado do Firebase");
        }
      }catch(e){
        console.warn("Falha ao importar histórico legado:", e);
      }
    }, 1200);

  }catch(e){
    console.warn("Falha ao iniciar Firestore:", e);
  }
}

async function saveMetaToFirestore(){
  if(!fbReady || isApplyingRemote) return;
  const now = Date.now();

  const metaRef = fbDb
    .collection("apps")
    .doc("bela_mares_checklist")
    .collection("state")
    .doc("meta");

  const payload = {
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    updatedAtMs: now,
    meta: JSON.stringify(persistableMetaState())
  };

  await metaRef.set(payload, { merge:true });
}

async function saveApartmentDoc(obraId, blockId, apto){
  if(!fbReady || isApplyingRemote) return;

  const apt = getOrMakeApartment(obraId, blockId, apto);
  if(!apt) return;

  const now = Date.now();

  const aRef = fbDb
    .collection("apps")
    .doc("bela_mares_checklist")
    .collection(APARTMENTS_COLLECTION)
    .doc(makeAptDocId(obraId, blockId, apto));

  const payload = {
    obraId,
    obraName: state.obras?.[obraId]?.name || obraId,
    blockId,
    apto: String(apto),
    pendencias: Array.isArray(apt.pendencias) ? apt.pendencias : [],
    photos: Array.isArray(apt.photos) ? apt.photos : [],
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    updatedAtMs: now
  };

  await aRef.set(payload, { merge:true });
}

async function deleteApartmentDoc(obraId, blockId, apto){
  if(!fbReady || isApplyingRemote) return;
  const ref = fbDb
    .collection("apps")
    .doc("bela_mares_checklist")
    .collection(APARTMENTS_COLLECTION)
    .doc(makeAptDocId(obraId, blockId, apto));

  try{
    await ref.delete();
  }catch(e){
    console.warn("Falha ao excluir apartment doc:", e);
  }
}

async function deleteAllApartmentDocsForObra(obraId){
  if(!fbReady || isApplyingRemote) return;
  const obra = state.obras?.[obraId];
  if(!obra) return;

  const batch = fbDb.batch();

  Object.values(obra.blocks || {}).forEach(block=>{
    const nums = aptNumsForBlock(obra, block);
    nums.forEach(apto=>{
      const ref = fbDb
        .collection("apps")
        .doc("bela_mares_checklist")
        .collection(APARTMENTS_COLLECTION)
        .doc(makeAptDocId(obraId, block.id, apto));
      batch.delete(ref);
    });
  });

  try{
    await batch.commit();
  }catch(e){
    console.warn("Falha ao apagar apartments da obra:", e);
  }
}

function queueSaveToFirestore(){
  if(!fbReady) return;
  if(saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async ()=>{
    if(isApplyingRemote) return;
    try{
      await saveMetaToFirestore();
    }catch(e){
      console.error("Firestore meta save failed:", e);
    }
  }, 250);
}

function saveState(){
  safeSetItem(STORAGE_KEY, JSON.stringify(persistableStateForLocal()));
  try{ queueSaveToFirestore(); }catch(_){}
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
  return state.users.find(u => u.id === state.session.userId) || null;
}

function logout(){
  state.session = null;
  setSessionUserId("");
  saveState();
  goto("login");
}

function getUserCityScope(user){
  if(!user) return null;
  if(user.role === "qualidade") return user.cityScope || "*";
  return "*";
}

function userCanSeeCity(user, city){
  if(!user) return false;
  const scope = getUserCityScope(user);
  if(scope === "*" || !scope) return true;
  return scope === normalizeCity(city || "valparaiso");
}

function canSeeObra(user, obraId){
  if(!user) return false;
  const obra = state.obras[obraId];
  if(!obra) return false;

  if(["supervisor","coordenador","engenheiro","diretor"].includes(user.role)) return true;

  if(user.role === "qualidade"){
    return userCanSeeCity(user, obra.city);
  }

  if(user.role === "execucao"){
    return (user.obraIds || []).includes(obraId);
  }

  return false;
}

function canManageUsers(user){
  return !!user && user.role === "supervisor";
}

function canCreateSupervisor(user){
  return !!user && user.role === "supervisor";
}

function canManageObras(user){
  return !!user && ["supervisor","qualidade"].includes(user.role);
}

function canReview(user){
  return !!user && user.role === "supervisor";
}

// ---------- Router ----------
const routes = {
  screen:"login",
  obraId:null,
  blockId:null,
  aptNum:null,
  tab:"pendencias",
  historyFilter:"all"
};

function goto(screen, params={}){
  Object.assign(routes, {
    screen,
    obraId:null,
    blockId:null,
    aptNum:null,
    tab:"pendencias",
    historyFilter:"all"
  }, params);
  render();
}

// ---------- Derived ----------
function visibleObrasFor(u){
  const idx = [...(state.obras_index || [])]
    .filter(o => !!state.obras[o.id])
    .sort((a,b)=> a.name.localeCompare(b.name, "pt-BR"));

  if(!u) return [];

  if(["supervisor","coordenador","engenheiro","diretor"].includes(u.role)) return idx;

  if(u.role === "qualidade"){
    if(u.id === "qualidade_aguaslindas"){
      return idx.filter(o => normalizeCity(o.city) === "aguaslindas");
    }
    return idx.filter(o => normalizeCity(o.city) === "valparaiso");
  }

  if(u.role === "execucao"){
    return idx.filter(o => (u.obraIds || []).includes(o.id));
  }

  return [];
}

function apartmentStatus(a){
  const ps = a?.pendencias || [];
  const aptPhotos = a?.photos || [];

  const hasPendencias = ps.length > 0;
  const hasPhotos = aptPhotos.length > 0;

  const hasInspectionMark =
    !!a?._meta?.synced ||
    !!a?._meta?.updatedAtMs ||
    !!a?.vistoriadoAt ||
    !!a?.checkedAt ||
    !!a?.reviewedAt ||
    !!a?.vistoriado ||
    a?.status === "conferido" ||
    a?.status === "vistoriado";

  if(ps.some(p => p.state === "reprovado")) return "reprovado";
  if(ps.some(p => p.state === "pendente")) return "pendente";
  if(hasPendencias && ps.every(p => p.state === "feito")) return "feito";
  if(hasPendencias && ps.every(p => p.state === "conferido")) return "conferido";
  if(!hasPendencias && (hasPhotos || hasInspectionMark)) return "conferido";

  return "sem_vistoria";
}

function obraCounters(obra){
  let total=0, semVist=0, pend=0, feito=0, conferido=0, reprov=0;

  Object.values(obra.blocks || {}).forEach(b=>{
    const nums = aptNumsForBlock(obra, b);
    nums.forEach(num=>{
      total++;
      const a = getApartmentView(obra.id, b.id, num);
      const st = apartmentStatus(a);

      if(st === "sem_vistoria") semVist++;
      if(st === "pendente") pend++;
      if(st === "feito") feito++;
      if(st === "conferido") conferido++;
      if(st === "reprovado") reprov++;
    });
  });

  return { total, semVist, pend, feito, conferido, reprov };
}

function blockCounters(obra, block){
  let total=0, semVist=0, pend=0, feito=0, conferido=0, reprov=0;
  const nums = aptNumsForBlock(obra, block);

  nums.forEach(num=>{
    total++;
    const a = getApartmentView(obra.id, block.id, num);
    const st = apartmentStatus(a);

    if(st === "sem_vistoria") semVist++;
    if(st === "pendente") pend++;
    if(st === "feito") feito++;
    if(st === "conferido") conferido++;
    if(st === "reprovado") reprov++;
  });

  return { total, semVist, pend, feito, conferido, reprov };
}

function allHistoryEntries(){
  const rows = [];
  Object.values(state.obras).forEach(obra=>{
    Object.values(obra.blocks || {}).forEach(block=>{
      Object.values(block.apartments || {}).forEach(apt=>{
        (apt.pendencias || []).forEach(p=>{
          rows.push({
            type:"Criada",
            date:p.createdAt,
            by:p.createdBy?.name || "-",
            role:p.createdBy?.role || "-",
            obra:obra.name,
            block:block.id,
            apt:apt.num,
            title:p.title,
            category:p.category || "",
            location:p.location || "",
            dur:"-"
          });

          if(p.doneAt){
            rows.push({
              type:"Feita",
              date:p.doneAt,
              by:p.doneBy?.name || "-",
              role:p.doneBy?.role || "-",
              obra:obra.name,
              block:block.id,
              apt:apt.num,
              title:p.title,
              category:p.category || "",
              location:p.location || "",
              dur: diffHM(p.createdAt, p.doneAt)
            });
          }

          if(p.reviewedAt && p.state === "conferido"){
            rows.push({
              type:"Conferida",
              date:p.reviewedAt,
              by:p.reviewedBy?.name || "-",
              role:p.reviewedBy?.role || "-",
              obra:obra.name,
              block:block.id,
              apt:apt.num,
              title:p.title,
              category:p.category || "",
              location:p.location || "",
              dur: p.doneAt ? diffHM(p.doneAt, p.reviewedAt) : "-"
            });
          }

          if(p.reviewedAt && p.state === "reprovado"){
            rows.push({
              type:"Reprovada",
              date:p.reviewedAt,
              by:p.reviewedBy?.name || "-",
              role:p.reviewedBy?.role || "-",
              obra:obra.name,
              block:block.id,
              apt:apt.num,
              title:p.title,
              category:p.category || "",
              location:p.location || "",
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

// ---------- UI ----------
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
      ${u ? `<div class="pill pill--soft">${esc(u.name)} · ${ROLE_LABEL[u.role] || u.role}</div>` : ``}
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
  if(!u && routes.screen !== "login"){
    goto("login");
    return;
  }

  let html = "";
  if(routes.screen === "login") html = renderLogin();
  else if(routes.screen === "home") html = renderHome(u);
  else if(routes.screen === "users") html = renderUsers(u);
  else if(routes.screen === "createObra") html = renderCreateObra(u);
  else if(routes.screen === "obra") html = renderObra(u, routes.obraId);
  else if(routes.screen === "block") html = renderBlock(u, routes.obraId, routes.blockId);
  else if(routes.screen === "apt") html = renderApartment(u, routes.obraId, routes.blockId, routes.aptNum);
  else if(routes.screen === "history") html = renderHistory(u);
  else html = renderLogin();

  app.innerHTML = html;
  bindCommon();
  if(routes.screen === "login") bindLogin();
  if(routes.screen === "users") bindUsers(u);
  if(routes.screen === "createObra") bindCreateObra(u);
  if(routes.screen === "home") bindHome(u);
  if(routes.screen === "obra") bindObra(u, routes.obraId);
  if(routes.screen === "block") bindBlock(u, routes.obraId, routes.blockId);
  if(routes.screen === "apt") bindApartment(u, routes.obraId, routes.blockId, routes.aptNum);
  if(routes.screen === "history") bindHistory(u);
}

function bindCommon(){
  $$(".js-logout").forEach(b => b.onclick = logout);
  $$(".js-home").forEach(b => b.onclick = ()=> goto("home"));
}

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
    const user = ($("#loginUser").value || "").trim();
    const pin = ($("#loginPin").value || "").trim();
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
    if(e.key === "Enter") $("#btnLogin").click();
  });

  $("#loginUser").addEventListener("keydown", (e)=>{
    if(e.key === "Enter") $("#loginPin").focus();
  });
}

function renderHome(u){
  const obras = visibleObrasFor(u);

  const actions = [];
  if(canManageUsers(u)) actions.push(`<button class="btn" id="btnUsers">Usuários</button>`);
  if(canManageObras(u)) actions.push(`<button class="btn btn--orange" id="btnCreateObra">+ Obra</button>`);
  actions.push(`<button class="btn" id="btnHistory">Histórico</button>`);
  actions.push(`<button class="btn js-logout">Sair</button>`);

  const listByCity = (city, title) => {
    const arr = obras.filter(o => normalizeCity(o.city) === city);
    if(!arr.length) return "";
    return `
      <div class="city-group">
        <div class="city-line">${title}</div>
        <div class="grid grid--obra">
          ${arr.map(o=>{
            const obra = state.obras[o.id];
            const c = obra ? obraCounters(obra) : { total:0, semVist:0, pend:0, feito:0, conferido:0, reprov:0 };
            return `
              <button class="card obra-card js-open-obra" data-obra="${esc(o.id)}">
                <div class="obra-card__title">${esc(o.name)}</div>
                <div class="obra-card__meta">${c.total} aptos</div>
                <div class="obra-stats">
                  <span class="stat stat--sem">Sem vist.: ${c.semVist}</span>
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
    b.onclick = ()=> goto("obra", { obraId: b.dataset.obra });
  });
}

function renderUsers(u){
  if(!canManageUsers(u)) return renderForbidden();

  const list = state.users
    .slice()
    .sort((a,b)=> a.name.localeCompare(b.name, "pt-BR"))
    .map(x=>`
      <div class="row row--user">
        <div>
          <div class="strong">${esc(x.name)}</div>
          <div class="small">
            ${esc(x.id)} · ${ROLE_LABEL[x.role] || x.role}
            ${x.role === "qualidade" ? ` · Escopo: ${esc(x.cityScope || "*")}` : ``}
            · PIN: ${esc(x.pin)}
          </div>
        </div>
        <div class="row" style="gap:8px">
          ${x.role === "supervisor" ? `` : `<button class="btn btn--danger js-del-user" data-user="${esc(x.id)}">Excluir</button>`}
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
      const id = slugify(prompt("Usuário (id):") || "");
      if(!id) return toast("Informe um id válido");
      const pin = (prompt("PIN:") || "").trim();
      if(!pin) return toast("Informe um PIN");
      if(state.users.some(x=>x.id===id)) return toast("ID de usuário já existe");

      state.users.push({
        id, name, role:"supervisor", pin,
        obraIds:["*"], active:true, cityScope:"*"
      });
      saveState();
      render();
      toast("Supervisor criado");
    };
  }

  $("#btnCreateUser").onclick = ()=>{
    const name = ($("#newUserName").value || "").trim();
    const id = slugify(($("#newUserId").value || "").trim());
    const pin = ($("#newUserPin").value || "").trim();
    const role = ($("#newUserRole").value || "").trim();
    const obraId = ($("#newUserObra").value || "").trim();

    if(!name || !id || !pin) return toast("Preencha nome, usuário e PIN");
    if(state.users.some(x=>x.id===id)) return toast("ID de usuário já existe");
    if(role !== "execucao") return toast("Só é permitido criar login de execução aqui");
    if(!state.obras[obraId]) return toast("Selecione uma obra válida");

    state.users.push({
      id, name, role, pin,
      obraIds:[obraId],
      active:true
    });
    saveState();
    render();
    toast("Login criado");
  };

  $$(".js-del-user").forEach(b=>{
    b.onclick = ()=>{
      const id = b.dataset.user;
      const user = state.users.find(x=>x.id===id);
      if(!user) return;
      if(!confirm(`Excluir o login "${user.name}"?`)) return;
      state.users = state.users.filter(x=>x.id!==id);
      saveState();
      render();
      toast("Login excluído");
    };
  });
}

function renderCreateObra(u){
  if(!canManageObras(u)) return renderForbidden();

  const cityScope = getUserCityScope(u);
  const cityDisabled = u.role === "qualidade" ? "disabled" : "";

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
            <select id="obraCity" ${cityDisabled}>
              <option value="valparaiso" ${(cityScope==="valparaiso" || cityScope==="*") ? "" : "disabled"} ${(cityScope==="valparaiso") ? "selected" : ""}>Valparaíso</option>
              <option value="aguaslindas" ${(cityScope==="aguaslindas" || cityScope==="*") ? "" : "disabled"} ${(cityScope==="aguaslindas") ? "selected" : ""}>Águas Lindas</option>
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
    const name = ($("#obraName").value || "").trim();
    const rawCode = ($("#obraCode").value || "").trim();
    let city = normalizeCity(($("#obraCity").value || "valparaiso").trim());
    const numBlocks = Math.max(1, Number($("#obraBlocks").value || 1));
    const aptsPerBlock = Number($("#obraApts").value || 16) === 12 ? 12 : 16;
    const execName = ($("#execName").value || "").trim();
    const execUser = slugify(($("#execUser").value || "").trim());
    const execPin = ($("#execPin").value || "").trim();

    if(u.role === "qualidade"){
      city = normalizeCity(u.cityScope || city);
    }

    if(!name || !execName || !execUser || !execPin) return toast("Preencha todos os campos");

    const obraId = slugify(rawCode || name);
    if(state.obras[obraId] || state.obras_index.some(x=>x.id===obraId)) return toast("ID da obra já existe");
    if(state.users.some(x=>x.id===execUser)) return toast("Usuário de execução já existe");

    const blocks = {};
    for(let i=1;i<=numBlocks;i++){
      const bid = "B" + i;
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

    state._meta.deletedObraIds = (state._meta.deletedObraIds || []).filter(x => x !== obraId);
    state._meta.deletedExecIds = (state._meta.deletedExecIds || []).filter(x => x !== execUser);

    saveState();
    toast("Obra criada com sucesso");
    goto("home");
  };
}

function renderObra(u, obraId){
  const obra = state.obras[obraId];
  if(!obra || !canSeeObra(u, obraId)) return renderForbidden();

  const blocks = Object.values(obra.blocks || {})
    .sort((a,b)=> Number(String(a.id).replace(/\D/g,"")) - Number(String(b.id).replace(/\D/g,"")))
    .map(b=>{
      const c = blockCounters(obra, b);
      return `
        <button class="card block-card js-open-block" data-block="${esc(b.id)}">
          <div class="block-card__title">${esc(b.id)}</div>
          <div class="obra-stats">
            <span class="stat stat--sem">Sem vist.: ${c.semVist}</span>
            <span class="stat stat--pend">Pend.: ${c.pend}</span>
            <span class="stat stat--feito">Feito: ${c.feito}</span>
            <span class="stat stat--conf">Conf.: ${c.conferido}</span>
            <span class="stat stat--repr">Repr.: ${c.reprov}</span>
          </div>
        </button>
      `;
    }).join("");

  const deleteBtn = canManageObras(u)
    ? `<button class="btn btn--subtle-danger btn--small" id="btnDeleteObra">Excluir obra</button>`
    : ``;

  return `
  <div class="shell">
    ${topbar(esc(obra.name), `${obra.city==="aguaslindas" ? "Águas Lindas" : "Valparaíso"} · ${obra.config?.numBlocks || 0} blocos`, `
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

      const execUsers = state.users.filter(x => x.role === "execucao" && (x.obraIds || []).includes(obraId));
      const execMsg = execUsers.length
        ? `\nTambém será(ão) excluído(s) o(s) login(s): ${execUsers.map(x=>x.id).join(", ")}`
        : "";

      if(!confirm(`Excluir a obra "${obra.name}"?${execMsg}\n\nEssa ação remove a obra para poder recriá-la do zero depois.`)) return;

      state._meta.deletedObraIds = Array.from(new Set([...(state._meta.deletedObraIds || []), obraId]));
      execUsers.forEach(x=>{
        state._meta.deletedExecIds = Array.from(new Set([...(state._meta.deletedExecIds || []), x.id]));
      });

      try{
        await deleteAllApartmentDocsForObra(obraId);
      }catch(e){
        console.warn("Falha ao excluir apartments da obra:", e);
      }

      state.users = state.users.filter(x => !(x.role==="execucao" && (x.obraIds || []).includes(obraId)));
      delete state.obras[obraId];
      state.obras_index = state.obras_index.filter(x => x.id !== obraId);
      state.last_obras_refresh = new Date().toISOString();

      saveState();
      toast("Obra excluída");
      goto("home");
    };
  }
}

function renderBlock(u, obraId, blockId){
  const obra = state.obras[obraId];
  const block = obra?.blocks?.[blockId];
  if(!obra || !block || !canSeeObra(u, obraId)) return renderForbidden();

  const nums = aptNumsForBlock(obra, block);

  const cards = nums.map(n=>{
    const a = getApartmentView(obraId, blockId, n);
    const st = apartmentStatus(a);

    const extra =
      st==="sem_vistoria" ? "card-apt--sem" :
      st==="pendente" ? "card-apt--pend" :
      st==="feito" ? "card-apt--feito" :
      st==="reprovado" ? "card-apt--repr" :
      "card-apt--conf";

    const label =
      st==="sem_vistoria" ? "Sem vistoria" :
      st==="pendente" ? "Com pendências" :
      st==="feito" ? "Aguardando conferência" :
      st==="reprovado" ? "Reprovado" :
      "Concluído";

    return `
      <button class="card apt-card ${extra} js-open-apt" data-apt="${esc(n)}">
        <div class="apt-card__num">${esc(n)}</div>
        <div class="apt-card__status">${label}</div>
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

function renderApartment(u, obraId, blockId, aptNum){
  const obra = state.obras[obraId];
  const block = obra?.blocks?.[blockId];
  const apt = getApartmentView(obraId, blockId, aptNum);
  if(!obra || !block || !apt || !canSeeObra(u, obraId)) return renderForbidden();

  const tabs = `
    <div class="tabs">
      <button class="tab ${routes.tab==="pendencias" ? "is-active" : ""}" data-tab="pendencias">Pendências</button>
      <button class="tab ${routes.tab==="fotos" ? "is-active" : ""}" data-tab="fotos">Fotos</button>
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
  const canCreate = u.role==="qualidade" || u.role==="supervisor";
  const canDo = u.role==="execucao";
  const canDeleteOwn = u.role==="qualidade" || u.role==="supervisor";
  const canSupervisorDelete = u.role==="supervisor";

  const list = (apt.pendencias || [])
    .slice()
    .sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt))
    .map(p=>{
      const badge =
        p.state==="pendente" ? `<span class="badge badge--pend">Pendente</span>` :
        p.state==="feito" ? `<span class="badge badge--feito">Aguardando conferência</span>` :
        p.state==="reprovado" ? `<span class="badge badge--repr">Reprovado</span>` :
        `<span class="badge badge--conf">Conferido</span>`;

      const photos = (p.photos || []).map(ph => `
        <a class="photo-thumb" href="${esc(ph.dataUrl || "#")}" target="_blank" rel="noopener">
          <img src="${esc(ph.dataUrl || "")}" alt="foto"/>
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
              <div class="small">${esc(p.category || "-")} · ${esc(p.location || "-")}</div>
              <div class="small">Criada por ${esc(p.createdBy?.name || "-")} em ${fmtDT(p.createdAt)}</div>
              ${p.doneAt ? `<div class="small">Feita por ${esc(p.doneBy?.name || "-")} em ${fmtDT(p.doneAt)}</div>` : ``}
              ${p.reviewedAt ? `<div class="small">${p.state==="conferido" ? "Conferida" : "Reprovada"} por ${esc(p.reviewedBy?.name || "-")} em ${fmtDT(p.reviewedAt)}</div>` : ``}
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
  const canUpload = u.role==="qualidade" || u.role==="supervisor";

  const photos = (apt.photos || [])
    .slice()
    .sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt))
    .map(ph=>`
      <div class="card">
        <a class="photo-thumb photo-thumb--big" href="${esc(ph.dataUrl || "#")}" target="_blank" rel="noopener">
          <img src="${esc(ph.dataUrl || "")}" alt="foto apartamento"/>
        </a>
        <div class="small" style="margin-top:8px">${fmtDT(ph.createdAt)} · ${esc(ph.createdBy?.name || "-")}</div>
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
    t.onclick = ()=>{
      routes.tab = t.dataset.tab;
      render();
    };
  });

  const apt = getOrMakeApartment(obraId, blockId, aptNum);
  if(!apt) return;

  const btnAddPend = $("#btnAddPend");
  if(btnAddPend){
    btnAddPend.onclick = async ()=>{
      const title = ($("#pendTitle").value || "").trim();
      const category = ($("#pendCategory").value || "").trim();
      const location = ($("#pendLocation").value || "").trim();
      const files = Array.from($("#pendPhotos").files || []);
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

      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Pendência adicionada");
    };
  }

  const btnAddAptPhotos = $("#btnAddAptPhotos");
  if(btnAddAptPhotos){
    btnAddAptPhotos.onclick = async ()=>{
      const files = Array.from($("#aptPhotos").files || []);
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

      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Fotos enviadas");
    };
  }

  $$(".js-del-apt-photo").forEach(b=>{
    b.onclick = async ()=>{
      const phId = b.dataset.ph;
      if(!confirm("Excluir esta foto?")) return;
      apt.photos = (apt.photos || []).filter(x=>x.id !== phId);
      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Foto excluída");
    };
  });

  $$(".js-mark-done").forEach(b=>{
    b.onclick = async ()=>{
      const p = (apt.pendencias || []).find(x=>x.id===b.dataset.p);
      if(!p) return;
      p.state = "feito";
      p.doneAt = new Date().toISOString();
      p.doneBy = { id:u.id, name:u.name, role:u.role };
      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Marcado como feito");
    };
  });

  $$(".js-undo-done").forEach(b=>{
    b.onclick = async ()=>{
      const p = (apt.pendencias || []).find(x=>x.id===b.dataset.p);
      if(!p) return;
      p.state = "pendente";
      p.doneAt = null;
      p.doneBy = null;
      p.reviewedAt = null;
      p.reviewedBy = null;
      p.rejection = null;
      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Feito desfeito");
    };
  });

  $$(".js-review-ok").forEach(b=>{
    b.onclick = async ()=>{
      const p = (apt.pendencias || []).find(x=>x.id===b.dataset.p);
      if(!p) return;
      p.state = "conferido";
      p.reviewedAt = new Date().toISOString();
      p.reviewedBy = { id:u.id, name:u.name, role:u.role };
      p.rejection = null;
      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Pendência conferida");
    };
  });

  $$(".js-review-no").forEach(b=>{
    b.onclick = async ()=>{
      const p = (apt.pendencias || []).find(x=>x.id===b.dataset.p);
      if(!p) return;
      const reason = prompt("Motivo da reprovação:") || "";
      p.state = "reprovado";
      p.reviewedAt = new Date().toISOString();
      p.reviewedBy = { id:u.id, name:u.name, role:u.role };
      p.rejection = reason.trim();
      p.reopenedAt = new Date().toISOString();
      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Pendência reprovada");
    };
  });

  $$(".js-rework").forEach(b=>{
    b.onclick = async ()=>{
      const p = (apt.pendencias || []).find(x=>x.id===b.dataset.p);
      if(!p) return;
      p.state = "feito";
      p.doneAt = new Date().toISOString();
      p.doneBy = { id:u.id, name:u.name, role:u.role };
      p.reviewedAt = null;
      p.reviewedBy = null;
      p.rejection = null;
      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Retrabalho marcado como feito");
    };
  });

  $$(".js-del-pend").forEach(b=>{
    b.onclick = async ()=>{
      const p = (apt.pendencias || []).find(x=>x.id===b.dataset.p);
      if(!p) return;
      if(!(u.role==="supervisor" || ((u.role==="qualidade" || u.role==="supervisor") && p.createdBy?.id===u.id))){
        return toast("Você não pode excluir esta pendência");
      }
      if(!confirm("Excluir esta pendência?")) return;
      apt.pendencias = (apt.pendencias || []).filter(x=>x.id !== p.id);
      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Pendência excluída");
    };
  });
}

function renderHistory(u){
  const rows = allHistoryEntries();
  const filter = routes.historyFilter || "all";
  const filtered = filter === "all"
    ? rows
    : rows.filter(r => slugify(r.type) === slugify(filter));

  return `
  <div class="shell">
    ${topbar("Histórico geral","Ações realizadas no app",`
      <button class="btn js-home">Voltar</button>
      <button class="btn js-logout">Sair</button>
    `)}
    <div class="content">
      <div class="card">
        <div class="row" style="gap:8px; flex-wrap:wrap">
          <button class="btn ${filter==="all" ? "btn--primary" : ""} js-hf" data-f="all">Todos</button>
          <button class="btn ${filter==="Criada" ? "btn--primary" : ""} js-hf" data-f="Criada">Criadas</button>
          <button class="btn ${filter==="Feita" ? "btn--primary" : ""} js-hf" data-f="Feita">Feitas</button>
          <button class="btn ${filter==="Conferida" ? "btn--primary" : ""} js-hf" data-f="Conferida">Conferidas</button>
          <button class="btn ${filter==="Reprovada" ? "btn--primary" : ""} js-hf" data-f="Reprovada">Reprovadas</button>
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
                <td>${esc(ROLE_LABEL[r.role] || r.role)}</td>
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

function bindHistory(){
  $$(".js-hf").forEach(b=>{
    b.onclick = ()=>{
      routes.historyFilter = b.dataset.f;
      render();
    };
  });
}

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

// ---------- CSS ----------
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
    --danger-soft:#374151;
    --danger-soft-border:#4b5563;
    --ok:#16a34a;
    --warn:#ca8a04;
    --repr:#b91c1c;
    --sem:#64748b;
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
  @media (max-width:720px){
    .form.grid2{grid-template-columns:1fr}
  }
  label{font-size:13px;color:var(--muted)}
  input,select{
    width:100%;
    padding:12px 14px;
    border-radius:12px;
    border:1px solid var(--line);
    background:#0b1220;
    color:var(--text);
    outline:none
  }
  input::placeholder{color:#94a3b8}
  .btn{
    border:1px solid var(--line);
    background:#0b1220;
    color:var(--text);
    padding:10px 14px;
    border-radius:12px;
    cursor:pointer
  }
  .btn:hover{filter:brightness(1.08)}
  .btn--block{width:100%}
  .btn--small{padding:7px 10px;font-size:12px}
  .btn--primary{background:var(--primary);border-color:#1d4ed8}
  .btn--orange{background:var(--orange);border-color:#c2410c}
  .btn--danger{background:var(--danger);border-color:#b91c1c}
  .btn--subtle-danger{
    background:var(--danger-soft);
    border-color:var(--danger-soft-border);
    color:#e5e7eb;
  }
  .grid{display:grid;gap:14px}
  .grid--obra{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
  .grid--block{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
  .grid--apt{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}
  .obra-card,.block-card,.apt-card{
    text-align:left;
    cursor:pointer;
    background:var(--card-2);
    min-height:110px
  }
  .obra-card__title,.block-card__title,.apt-card__num{font-size:20px;font-weight:700}
  .obra-card__meta,.apt-card__status{font-size:13px;color:var(--muted);margin-top:6px}
  .obra-stats{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:8px;
    margin-top:12px;
  }
  .stat{
    font-size:12px;
    padding:6px 8px;
    border-radius:999px;
    border:1px solid transparent;
    background:#0b1220;
    text-align:center;
    white-space:nowrap;
  }
  .stat--sem{border-color:#475569;background:#1e293b}
  .stat--pend{border-color:#854d0e;background:#3f2b05}
  .stat--feito{border-color:#1d4ed8;background:#102a56}
  .stat--conf{border-color:#166534;background:#0f2a1c}
  .stat--repr{border-color:#991b1b;background:#3b0c0c}
  .badge{
    font-size:12px;
    padding:6px 10px;
    border-radius:999px;
    border:1px solid transparent;
    white-space:nowrap
  }
  .badge--pend{border-color:#854d0e;background:#3f2b05}
  .badge--feito{border-color:#1d4ed8;background:#102a56}
  .badge--conf{border-color:#166534;background:#0f2a1c}
  .badge--repr{border-color:#991b1b;background:#3b0c0c}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
  .tab{
    padding:10px 14px;
    border-radius:12px;
    border:1px solid var(--line);
    background:#0b1220;
    color:var(--text);
    cursor:pointer
  }
  .tab.is-active{background:var(--primary);border-color:#1d4ed8}
  .stack{display:grid;gap:12px}
  .row{display:flex;align-items:center}
  .row--user{justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}
  .list{margin-top:12px}
  .photo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px}
  .photo-thumb{
    display:block;
    border-radius:12px;
    overflow:hidden;
    border:1px solid var(--line);
    background:#0b1220
  }
  .photo-thumb img{display:block;width:100%;height:110px;object-fit:cover}
  .photo-thumb--big img{height:auto;max-height:420px;object-fit:contain;background:#020617}
  .table{width:100%;border-collapse:collapse}
  .table th,.table td{
    padding:10px;
    border-bottom:1px solid var(--line);
    text-align:left;
    vertical-align:top;
    font-size:13px
  }
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
  .card-apt--sem{background:#243244;border-color:#506273}
  .card-apt--pend{background:#3a2a12;border-color:#8b5a1c}
  .card-apt--feito{background:#14263f;border-color:#274c7a}
  .card-apt--conf{background:#163222;border-color:#2a6b46}
  .card-apt--repr{background:#3a1616;border-color:#8b2b2b}
  #toast{
    position:fixed;
    left:50%;
    bottom:20px;
    transform:translateX(-50%);
    background:#020617;
    color:#fff;
    padding:12px 16px;
    border-radius:12px;
    border:1px solid #334155;
    display:none;
    z-index:9999
  }`;

  const style = document.createElement("style");
  style.id = "bm-style-fixes";
  style.textContent = css;
  document.head.appendChild(style);
})();

(function ensureToast(){
  let t = document.getElementById("toast");
  if(!t){
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
})();

(function rebuildIndexIfNeeded(){
  if(!Array.isArray(state.obras_index)) state.obras_index = [];
  const ids = new Set(state.obras_index.map(x=>x.id));
  Object.values(state.obras || {}).forEach(o=>{
    if(!ids.has(o.id)){
      state.obras_index.push({
        id:o.id,
        name:o.name,
        city:o.city || "valparaiso",
        config:o.config || {
          numBlocks:Object.keys(o.blocks || {}).length || 1,
          aptsPerBlock:16
        }
      });
    }
  });
  state.obras_index = state.obras_index.filter(x=> !!state.obras[x.id]);
  state.obras_index.sort((a,b)=> a.name.localeCompare(b.name, "pt-BR"));
})();

(function validateSession(){
  const u = getCurrentUser();
  if(state.session && !u){
    state.session = null;
    setSessionUserId("");
    saveState();
  }
})();

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
