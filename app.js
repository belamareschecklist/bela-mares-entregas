const APP_VERSION = "live-sync-v4-mobileflow";
const STATE_VERSION = 31;

/* Bela Mares — Checklist */
/* Compatibilidade mobile + fluxo Qualidade -> Supervisor */

const STORAGE_KEY = "bm_checklist_classic_v1";
const SESSION_KEY = "bm_checklist_session_user";
const APP_VERSION_KEY = "bm_checklist_app_version";

let localSaveDisabled = false;

(function ensureVersionReset(){
  try{
    const current = localStorage.getItem(APP_VERSION_KEY) || "";
    if(current !== APP_VERSION){
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.setItem(APP_VERSION_KEY, APP_VERSION);
    }
  }catch(e){
    console.warn("Falha ao validar versão local:", e);
  }
})();

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
    for(var i=0;i<obj.length;i++) stripLargeFields(obj[i]);
    return;
  }
  var keys = Object.keys(obj);
  for(var k=0;k<keys.length;k++){
    var key = keys[k];
    var v = obj[key];
    if(key === "dataUrl" && typeof v === "string"){
      obj[key] = null;
      continue;
    }
    stripLargeFields(v);
  }
}

function persistableStateForLocal(){
  var s = persistableState();
  try{ stripLargeFields(s); }catch(_){}
  return s;
}

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

var $ = function(sel, root){ return (root || document).querySelector(sel); };
var $$ = function(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

function toastEl(){ return $("#toast"); }
var toastTimer = null;
function toast(msg){
  var el = toastEl();
  if(!el) return;
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.style.display="none"; }, 2600);
}

function esc(s){
  return String(s || "").replace(/[&<>"']/g, function(c){
    return {
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#39;"
    }[c];
  });
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
  var s = String(v || "").trim().toLowerCase();
  if(s.indexOf("aguas") >= 0) return "aguaslindas";
  if(s.indexOf("águas") >= 0) return "aguaslindas";
  return "valparaiso";
}

function fmtDT(iso){
  if(!iso) return "-";
  try{
    var d = new Date(iso);
    var pad = function(n){ return String(n).padStart(2,"0"); };
    return pad(d.getDate()) + "/" + pad(d.getMonth()+1) + "/" + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }catch(e){
    return String(iso);
  }
}

function diffHM(aIso,bIso){
  if(!aIso || !bIso) return "-";
  try{
    var a = new Date(aIso).getTime();
    var b = new Date(bIso).getTime();
    var m = Math.max(0, Math.round((b-a)/60000));
    var h = Math.floor(m/60), mm = m % 60;
    return h + "h" + String(mm).padStart(2,"0");
  }catch(e){
    return "-";
  }
}

function readImageAsDataURL(file){
  return new Promise(function(resolve,reject){
    var r = new FileReader();
    r.onload = function(){ resolve(String(r.result || "")); };
    r.onerror = function(){ reject(r.error || new Error("Falha ao ler imagem")); };
    r.readAsDataURL(file);
  });
}

function uid(prefix){
  prefix = prefix || "id";
  return prefix + "_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

var APT_NUMS_12 = ["101","102","103","104","201","202","203","204","301","302","303","304"];
var APT_NUMS_16 = ["101","102","103","104","201","202","203","204","301","302","303","304","401","402","403","404"];

function aptNumsByConfig(aptsPerBlock){
  return Number(aptsPerBlock) === 12 ? APT_NUMS_12 : APT_NUMS_16;
}

function aptNumsForBlock(obra, block){
  var configured = aptNumsByConfig((obra && obra.config && obra.config.aptsPerBlock) || 16);
  var existing = Object.keys((block && block.apartments) || {}).sort(function(a,b){ return Number(a)-Number(b); });

  if(!existing.length) return configured;

  var allMap = {};
  var out = [];
  var i;
  for(i=0;i<configured.length;i++){
    if(!allMap[configured[i]]){ allMap[configured[i]] = true; out.push(configured[i]); }
  }
  for(i=0;i<existing.length;i++){
    if(!allMap[existing[i]]){ allMap[existing[i]] = true; out.push(existing[i]); }
  }
  out.sort(function(a,b){ return Number(a)-Number(b); });
  return out;
}

function makeEmptyApartment(num){
  return {
    num: String(num),
    pendencias: [],
    photos: []
  };
}

function getOrMakeApartment(obraId, blockId, aptNum){
  var obra = state.obras[obraId];
  if(!obra) return null;

  if(!obra.blocks) obra.blocks = {};
  if(!obra.blocks[blockId]) obra.blocks[blockId] = { id:blockId, apartments:{} };

  var block = obra.blocks[blockId];
  if(!block.apartments) block.apartments = {};

  var an = String(aptNum);
  if(!block.apartments[an]){
    block.apartments[an] = makeEmptyApartment(an);
  }
  return block.apartments[an];
}

function getApartmentView(obraId, blockId, aptNum){
  var obra = state.obras[obraId];
  var block = obra && obra.blocks ? obra.blocks[blockId] : null;
  var an = String(aptNum);
  return (block && block.apartments && block.apartments[an])
    ? block.apartments[an]
    : makeEmptyApartment(an);
}

function seed(){
  var s = {
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
      { id:"diretor", name:"Diretor", role:"diretor", pin:"9999", obraIds:["*"], active:true, cityScope:"*" }
    ],
    obras: {},
    obras_index: [],
    last_obras_refresh: new Date().toISOString(),
    _meta: {
      deletedObraIds: [],
      deletedExecIds: []
    }
  };

  function makeObra(id, name, numBlocks, aptsPerBlock, city){
    city = city || "valparaiso";
    var blocks = {};
    for(var b=1;b<=numBlocks;b++){
      var bid = "B" + b;
      blocks[bid] = { id: bid, apartments: {} };
    }
    s.obras[id] = {
      id:id,
      name:name,
      city:city,
      config:{ numBlocks:numBlocks, aptsPerBlock:aptsPerBlock },
      blocks:blocks
    };
    s.obras_index.push({
      id:id,
      name:name,
      city:city,
      config:{ numBlocks:numBlocks, aptsPerBlock:aptsPerBlock }
    });
  }

  makeObra("costa_rica", "Costa Rica - Entregas", 17, 12, "valparaiso");
  makeObra("costa_brava", "Costa Brava - Entregas", 6, 12, "valparaiso");

  var apt = getOrMakeApartment("costa_rica", "B17", "204");
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
    qualityReviewedAt:null,
    qualityReviewedBy:null,
    supervisorReviewedAt:null,
    supervisorReviewedBy:null,
    rejection:null,
    rejectionBy:null,
    rejectionAt:null,
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

  var obraKeys = Object.keys(s.obras);
  for(var i=0;i<obraKeys.length;i++){
    var obra = s.obras[obraKeys[i]];
    if(!obra.city) obra.city = "valparaiso";
    obra.city = normalizeCity(obra.city);
    if(!obra.config){
      obra.config = {
        numBlocks: Object.keys(obra.blocks || {}).length || 1,
        aptsPerBlock: 16
      };
    }
    if(!obra.blocks) obra.blocks = {};
    var blockKeys = Object.keys(obra.blocks);
    for(var j=0;j<blockKeys.length;j++){
      var block = obra.blocks[blockKeys[j]];
      if(!block.apartments) block.apartments = {};
      var aptKeys = Object.keys(block.apartments);
      for(var k=0;k<aptKeys.length;k++){
        var apt = block.apartments[aptKeys[k]];
        if(!Array.isArray(apt.pendencias)) apt.pendencias = [];
        if(!Array.isArray(apt.photos)) apt.photos = [];
        for(var p=0;p<apt.pendencias.length;p++){
          var pend = apt.pendencias[p];
          if(!pend.state) pend.state = "pendente";
          if(typeof pend.qualityReviewedAt === "undefined") pend.qualityReviewedAt = null;
          if(typeof pend.qualityReviewedBy === "undefined") pend.qualityReviewedBy = null;
          if(typeof pend.supervisorReviewedAt === "undefined") pend.supervisorReviewedAt = null;
          if(typeof pend.supervisorReviewedBy === "undefined") pend.supervisorReviewedBy = null;
          if(typeof pend.rejection === "undefined") pend.rejection = null;
          if(typeof pend.rejectionBy === "undefined") pend.rejectionBy = null;
          if(typeof pend.rejectionAt === "undefined") pend.rejectionAt = null;

          if(pend.state === "conferido" && pend.reviewedAt && !pend.supervisorReviewedAt && pend.reviewedBy && pend.reviewedBy.role === "supervisor"){
            pend.supervisorReviewedAt = pend.reviewedAt;
            pend.supervisorReviewedBy = pend.reviewedBy;
            pend.state = "concluido";
          }else if((pend.state === "conferido" || pend.state === "reprovado") && pend.reviewedAt && !pend.qualityReviewedAt){
            pend.qualityReviewedAt = pend.reviewedAt;
            pend.qualityReviewedBy = pend.reviewedBy || null;
          }
        }
      }
    }
  }

  s.obras_index = s.obras_index
    .filter(function(x){ return !!x && !!x.id; })
    .map(function(x){
      return {
        id:x.id,
        name:x.name,
        city: normalizeCity(x.city || (s.obras[x.id] && s.obras[x.id].city) || "valparaiso"),
        config: x.config || (s.obras[x.id] && s.obras[x.id].config) || { numBlocks:1, aptsPerBlock:16 }
      };
    });

  s.users = s.users.map(function(u){
    var next = {};
    for(var key in u) next[key] = u[key];
    if(typeof next.active !== "boolean") next.active = true;
    if(!Array.isArray(next.obraIds)) next.obraIds = [];
    if(next.role === "qualidade"){
      if(next.id === "qualidade_valparaiso") next.cityScope = "valparaiso";
      else if(next.id === "qualidade_aguaslindas") next.cityScope = "aguaslindas";
      else next.cityScope = next.cityScope || "*";
    }
    if(["supervisor","coordenador","engenheiro","diretor"].indexOf(next.role) >= 0){
      next.cityScope = "*";
    }
    return next;
  });

  s.version = STATE_VERSION;
  return s;
}

function loadState(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return seed();
    var parsed = JSON.parse(raw);
    if(!parsed || !parsed.version) return seed();
    if(parsed.session) delete parsed.session;
    return migrateState(parsed);
  }catch(e){
    return seed();
  }
}

var state = loadState();

function ensureSystemDefaults(){
  state = migrateState(state);

  var fixed = [
    { id:"supervisor_01", name:"Supervisor 01", role:"supervisor", pin:"3333", obraIds:["*"], active:true, cityScope:"*" },
    { id:"qualidade_valparaiso", name:"Qualidade Valparaíso", role:"qualidade", pin:"2222", obraIds:[], active:true, cityScope:"valparaiso" },
    { id:"qualidade_aguaslindas", name:"Qualidade Águas Lindas", role:"qualidade", pin:"2233", obraIds:[], active:true, cityScope:"aguaslindas" },
    { id:"coordenador", name:"Coordenador", role:"coordenador", pin:"7777", obraIds:["*"], active:true, cityScope:"*" },
    { id:"engenheiro", name:"Engenheiro Geral", role:"engenheiro", pin:"8888", obraIds:["*"], active:true, cityScope:"*" },
    { id:"diretor", name:"Diretor", role:"diretor", pin:"9999", obraIds:["*"], active:true, cityScope:"*" }
  ];

  for(var i=0;i<fixed.length;i++){
    var f = fixed[i];
    var idx = state.users.findIndex(function(u){ return u.id === f.id; });
    if(idx < 0) state.users.push(f);
    else state.users[idx] = {
      id:f.id,
      name:state.users[idx].name || f.name,
      role:f.role,
      pin:state.users[idx].pin || f.pin,
      obraIds:state.users[idx].obraIds || f.obraIds,
      active:true,
      cityScope:f.cityScope
    };
  }

  var obraKeys = Object.keys(state.obras);
  for(i=0;i<obraKeys.length;i++){
    var obra = state.obras[obraKeys[i]];
    if(!obra.city) obra.city = "valparaiso";
    obra.city = normalizeCity(obra.city);
    if(!obra.config){
      obra.config = {
        numBlocks: Object.keys(obra.blocks || {}).length || 1,
        aptsPerBlock: 16
      };
    }
    if(!obra.blocks) obra.blocks = {};
    var configuredBlocks = Number(obra.config.numBlocks) || 1;
    for(var n=1;n<=configuredBlocks;n++){
      var bid = "B" + n;
      if(!obra.blocks[bid]) obra.blocks[bid] = { id:bid, apartments:{} };
      if(!obra.blocks[bid].apartments) obra.blocks[bid].apartments = {};
    }
  }

  var seen = {};
  var rebuilt = [];
  var existing = state.obras_index.filter(function(x){ return !!x && !!x.id && !!state.obras[x.id]; });
  var fromObras = Object.keys(state.obras).map(function(id){
    var o = state.obras[id];
    return {
      id:o.id,
      name:o.name,
      city:o.city || "valparaiso",
      config:o.config || { numBlocks:1, aptsPerBlock:16 }
    };
  });
  var merged = existing.concat(fromObras);
  for(i=0;i<merged.length;i++){
    var x = merged[i];
    if(seen[x.id]) continue;
    seen[x.id] = true;
    rebuilt.push({
      id:x.id,
      name:x.name,
      city:normalizeCity(x.city),
      config:x.config || (state.obras[x.id] && state.obras[x.id].config) || { numBlocks:1, aptsPerBlock:16 }
    });
  }
  rebuilt.sort(function(a,b){ return a.name.localeCompare(b.name, "pt-BR"); });
  state.obras_index = rebuilt;

  try{
    var last = getSessionUserId();
    if(last){
      var u = state.users.find(function(x){ return String(x.id).toLowerCase() === last && x.active; });
      if(u) state.session = { userId: u.id };
      else setSessionUserId("");
    }
  }catch(_){}
}

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

var fbApp = null;
var fbDb = null;
var fbReady = false;
var fbMetaUnsub = null;
var fbApartmentsUnsub = null;
var saveTimer = null;
var isApplyingRemote = false;

function makeAptDocId(obraId, blockId, apto){
  return String(obraId) + "__" + String(blockId) + "__" + String(apto);
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
    var obraId = doc.obraId;
    var blockId = doc.blockId;
    var apto = String(doc.apto || doc.aptNum || "");
    if(!obraId || !blockId || !apto) return;

    var target = ensureAptPath(obraId, blockId, apto);

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
  var s = JSON.parse(JSON.stringify(state));
  if(s && s.session) delete s.session;
  return s;
}

function persistableMetaState(){
  return JSON.parse(JSON.stringify(persistableState()));
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

    var metaRef = fbDb
      .collection("apps")
      .doc("bela_mares_checklist")
      .collection("state")
      .doc("meta");

    var aptsRef = fbDb
      .collection("apps")
      .doc("bela_mares_checklist")
      .collection(APARTMENTS_COLLECTION);

    if(fbMetaUnsub) try{ fbMetaUnsub(); }catch(_){}
    if(fbApartmentsUnsub) try{ fbApartmentsUnsub(); }catch(_){}

    fbMetaUnsub = metaRef.onSnapshot(function(snap){
      if(!snap || !snap.exists) return;
      if(snap.metadata && snap.metadata.hasPendingWrites) return;

      var data = snap.data() || {};
      if(!data.meta) return;

      try{
        isApplyingRemote = true;
        var parsed = JSON.parse(data.meta);
        if(!parsed || typeof parsed !== "object"){
          isApplyingRemote = false;
          return;
        }

        var currentSession = (state && state.session) || null;

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
    }, function(err){ console.warn("Meta snapshot error:", err); });

    fbApartmentsUnsub = aptsRef.onSnapshot(function(qs){
      if(!qs) return;
      if(qs.metadata && qs.metadata.hasPendingWrites) return;

      var changed = false;

      qs.docChanges().forEach(function(ch){
        var data = ch.doc.data() || {};
        var obraId = data.obraId;
        var blockId = data.blockId;
        var apto = String(data.apto || data.aptNum || "");
        if(!obraId || !blockId || !apto) return;

        if(ch.type === "removed"){
          var obra = state.obras ? state.obras[obraId] : null;
          var block = obra && obra.blocks ? obra.blocks[blockId] : null;
          if(block && block.apartments && block.apartments[apto]){
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
    }, function(err){ console.warn("Apartments snapshot error:", err); });

  }catch(e){
    console.warn("Falha ao iniciar Firestore:", e);
  }
}

async function saveMetaToFirestore(){
  if(!fbReady || isApplyingRemote) return;
  var now = Date.now();

  var metaRef = fbDb
    .collection("apps")
    .doc("bela_mares_checklist")
    .collection("state")
    .doc("meta");

  var payload = {
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    updatedAtMs: now,
    meta: JSON.stringify(persistableMetaState())
  };

  await metaRef.set(payload, { merge:true });
}

async function saveApartmentDoc(obraId, blockId, apto){
  if(!fbReady || isApplyingRemote) return;

  var apt = getOrMakeApartment(obraId, blockId, apto);
  if(!apt) return;

  var now = Date.now();

  var aRef = fbDb
    .collection("apps")
    .doc("bela_mares_checklist")
    .collection(APARTMENTS_COLLECTION)
    .doc(makeAptDocId(obraId, blockId, apto));

  var payload = {
    obraId: obraId,
    obraName: (state.obras && state.obras[obraId] && state.obras[obraId].name) || obraId,
    blockId: blockId,
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
  var ref = fbDb
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
  var obra = state.obras ? state.obras[obraId] : null;
  if(!obra) return;

  var batch = fbDb.batch();

  Object.values(obra.blocks || {}).forEach(function(block){
    var nums = aptNumsForBlock(obra, block);
    nums.forEach(function(apto){
      var ref = fbDb
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

  saveTimer = setTimeout(async function(){
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

var ROLE_LABEL = {
  qualidade: "Qualidade",
  execucao: "Execução",
  supervisor: "Supervisor",
  coordenador: "Coordenador",
  engenheiro: "Engenheiro Geral",
  diretor: "Diretor"
};

function getCurrentUser(){
  if(!state.session) return null;
  return state.users.find(function(u){ return u.id === state.session.userId; }) || null;
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
  var scope = getUserCityScope(user);
  if(scope === "*" || !scope) return true;
  return scope === normalizeCity(city || "valparaiso");
}

function canSeeObra(user, obraId){
  if(!user) return false;
  var obra = state.obras[obraId];
  if(!obra) return false;

  if(["supervisor","coordenador","engenheiro","diretor"].indexOf(user.role) >= 0) return true;

  if(user.role === "qualidade"){
    return userCanSeeCity(user, obra.city);
  }

  if(user.role === "execucao"){
    return (user.obraIds || []).indexOf(obraId) >= 0;
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
  return !!user && ["supervisor","qualidade"].indexOf(user.role) >= 0;
}
function canSupervisorReview(user){
  return !!user && user.role === "supervisor";
}
function canQualityReview(user){
  return !!user && user.role === "qualidade";
}

var routes = {
  screen:"login",
  obraId:null,
  blockId:null,
  aptNum:null,
  tab:"pendencias",
  historyFilter:"all"
};

function goto(screen, params){
  params = params || {};
  Object.assign(routes, {
    screen:screen,
    obraId:null,
    blockId:null,
    aptNum:null,
    tab:"pendencias",
    historyFilter:"all"
  }, params);
  render();
}

function visibleObrasFor(u){
  var idx = (state.obras_index || []).slice()
    .filter(function(o){ return !!state.obras[o.id]; })
    .sort(function(a,b){ return a.name.localeCompare(b.name, "pt-BR"); });

  if(!u) return [];

  if(["supervisor","coordenador","engenheiro","diretor"].indexOf(u.role) >= 0) return idx;

  if(u.role === "qualidade"){
    if(u.id === "qualidade_aguaslindas"){
      return idx.filter(function(o){ return normalizeCity(o.city) === "aguaslindas"; });
    }
    return idx.filter(function(o){ return normalizeCity(o.city) === "valparaiso"; });
  }

  if(u.role === "execucao"){
    return idx.filter(function(o){ return (u.obraIds || []).indexOf(o.id) >= 0; });
  }

  return [];
}

function apartmentStatus(a){
  var ps = (a && a.pendencias) || [];
  var aptPhotos = (a && a.photos) || [];

  var hasPendencias = ps.length > 0;
  var hasPhotos = aptPhotos.length > 0;

  var hasInspectionMark =
    !!(a && a._meta && a._meta.synced) ||
    !!(a && a._meta && a._meta.updatedAtMs) ||
    !!(a && a.vistoriadoAt) ||
    !!(a && a.checkedAt) ||
    !!(a && a.reviewedAt) ||
    !!(a && a.vistoriado) ||
    (a && a.status === "conferido") ||
    (a && a.status === "vistoriado") ||
    (a && a.status === "concluido");

  if(ps.some(function(p){ return p.state === "pendente"; })) return "pendente";
  if(ps.some(function(p){ return p.state === "feito"; })) return "feito";
  if(hasPendencias && ps.every(function(p){ return p.state === "concluido"; })) return "concluido";
  if(hasPendencias && ps.every(function(p){ return p.state === "conferido" || p.state === "concluido"; })) return "conferido";

  if(!hasPendencias && (hasPhotos || hasInspectionMark)) return "conferido";

  return "sem_vistoria";
}

function obraCounters(obra){
  var total=0, semVist=0, pend=0, feito=0, conferido=0, concluido=0;

  Object.values(obra.blocks || {}).forEach(function(b){
    var nums = aptNumsForBlock(obra, b);
    nums.forEach(function(num){
      total++;
      var a = getApartmentView(obra.id, b.id, num);
      var st = apartmentStatus(a);

      if(st === "sem_vistoria") semVist++;
      if(st === "pendente") pend++;
      if(st === "feito") feito++;
      if(st === "conferido") conferido++;
      if(st === "concluido") concluido++;
    });
  });

  return { total:total, semVist:semVist, pend:pend, feito:feito, conferido:conferido, concluido:concluido };
}

function blockCounters(obra, block){
  var total=0, semVist=0, pend=0, feito=0, conferido=0, concluido=0;
  var nums = aptNumsForBlock(obra, block);

  nums.forEach(function(num){
    total++;
    var a = getApartmentView(obra.id, block.id, num);
    var st = apartmentStatus(a);

    if(st === "sem_vistoria") semVist++;
    if(st === "pendente") pend++;
    if(st === "feito") feito++;
    if(st === "conferido") conferido++;
    if(st === "concluido") concluido++;
  });

  return { total:total, semVist:semVist, pend:pend, feito:feito, conferido:conferido, concluido:concluido };
}

function allHistoryEntries(){
  var rows = [];
  Object.values(state.obras).forEach(function(obra){
    Object.values(obra.blocks || {}).forEach(function(block){
      Object.values(block.apartments || {}).forEach(function(apt){
        (apt.pendencias || []).forEach(function(p){
          rows.push({
            type:"Criada",
            date:p.createdAt,
            by:p.createdBy && p.createdBy.name || "-",
            role:p.createdBy && p.createdBy.role || "-",
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
              by:p.doneBy && p.doneBy.name || "-",
              role:p.doneBy && p.doneBy.role || "-",
              obra:obra.name,
              block:block.id,
              apt:apt.num,
              title:p.title,
              category:p.category || "",
              location:p.location || "",
              dur: diffHM(p.createdAt, p.doneAt)
            });
          }

          if(p.qualityReviewedAt && p.state !== "pendente"){
            rows.push({
              type:"Conferida",
              date:p.qualityReviewedAt,
              by:p.qualityReviewedBy && p.qualityReviewedBy.name || "-",
              role:p.qualityReviewedBy && p.qualityReviewedBy.role || "-",
              obra:obra.name,
              block:block.id,
              apt:apt.num,
              title:p.title,
              category:p.category || "",
              location:p.location || "",
              dur: p.doneAt ? diffHM(p.doneAt, p.qualityReviewedAt) : "-"
            });
          }

          if(p.supervisorReviewedAt && p.state === "concluido"){
            rows.push({
              type:"Concluída",
              date:p.supervisorReviewedAt,
              by:p.supervisorReviewedBy && p.supervisorReviewedBy.name || "-",
              role:p.supervisorReviewedBy && p.supervisorReviewedBy.role || "-",
              obra:obra.name,
              block:block.id,
              apt:apt.num,
              title:p.title,
              category:p.category || "",
              location:p.location || "",
              dur: p.qualityReviewedAt ? diffHM(p.qualityReviewedAt, p.supervisorReviewedAt) : "-"
            });
          }

          if(p.rejectionAt){
            rows.push({
              type:"Reprovada",
              date:p.rejectionAt,
              by:p.rejectionBy && p.rejectionBy.name || "-",
              role:p.rejectionBy && p.rejectionBy.role || "-",
              obra:obra.name,
              block:block.id,
              apt:apt.num,
              title:p.title,
              category:p.category || "",
              location:p.location || "",
              dur:"-"
            });
          }
        });
      });
    });
  });

  rows.sort(function(a,b){ return new Date(b.date) - new Date(a.date); });
  return rows;
}

var app = $("#app");

function topbar(title, subtitle, rightHtml){
  subtitle = subtitle || "";
  rightHtml = rightHtml || "";
  var u = getCurrentUser();
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
  var u = getCurrentUser();
  if(!u && routes.screen !== "login"){
    goto("login");
    return;
  }

  var html = "";
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
  $$(".js-logout").forEach(function(b){ b.onclick = logout; });
  $$(".js-home").forEach(function(b){ b.onclick = function(){ goto("home"); }; });
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
  $("#btnLogin").onclick = function(){
    var user = ($("#loginUser").value || "").trim();
    var pin = ($("#loginPin").value || "").trim();
    var u = state.users.find(function(x){ return x.id === user && String(x.pin) === pin && x.active; });
    if(!u){
      toast("Usuário ou PIN inválido");
      return;
    }
    state.session = { userId: u.id };
    setSessionUserId(u.id);
    saveState();
    goto("home");
  };

  $("#loginPin").addEventListener("keydown", function(e){
    if(e.key === "Enter") $("#btnLogin").click();
  });

  $("#loginUser").addEventListener("keydown", function(e){
    if(e.key === "Enter") $("#loginPin").focus();
  });
}

function renderHome(u){
  var obras = visibleObrasFor(u);

  var actions = [];
  if(canManageUsers(u)) actions.push(`<button class="btn" id="btnUsers">Usuários</button>`);
  if(canManageObras(u)) actions.push(`<button class="btn btn--orange" id="btnCreateObra">+ Obra</button>`);
  actions.push(`<button class="btn" id="btnHistory">Histórico</button>`);
  actions.push(`<button class="btn js-logout">Sair</button>`);

  function listByCity(city, title){
    var arr = obras.filter(function(o){ return normalizeCity(o.city) === city; });
    if(!arr.length) return "";
    return `
      <div class="city-group">
        <div class="city-line">${title}</div>
        <div class="grid grid--obra">
          ${arr.map(function(o){
            var obra = state.obras[o.id];
            var c = obra ? obraCounters(obra) : { total:0, semVist:0, pend:0, feito:0, conferido:0, concluido:0 };
            return `
              <button class="card obra-card js-open-obra" data-obra="${esc(o.id)}">
                <div class="obra-card__title">${esc(o.name)}</div>
                <div class="obra-card__meta">${c.total} aptos</div>
                <div class="obra-stats">
                  <span class="stat stat--sem">Sem vist.: ${c.semVist}</span>
                  <span class="stat stat--pend">Pend.: ${c.pend}</span>
                  <span class="stat stat--feito">Feito: ${c.feito}</span>
                  <span class="stat stat--conf">Conf.: ${c.conferido}</span>
                  <span class="stat stat--conc">Concl.: ${c.concluido}</span>
                </div>
              </button>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  return `
  <div class="shell">
    ${topbar(roleHomeLabel(u), "Selecione uma obra", actions.join(""))}
    <div class="content">
      ${listByCity("valparaiso", "Valparaíso")}
      ${listByCity("aguaslindas", "Águas Lindas")}
    </div>
  </div>`;
}

function renderUsers(u){
  if(!canManageUsers(u)) return renderForbidden();

  var list = state.users
    .slice()
    .sort(function(a,b){ return a.name.localeCompare(b.name, "pt-BR"); })
    .map(function(x){
      return `
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
      </div>`;
    }).join("");

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

function renderCreateObra(u){
  if(!canManageObras(u)) return renderForbidden();

  var cityScope = getUserCityScope(u);
  var cityDisabled = u.role === "qualidade" ? "disabled" : "";

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

function renderObra(u, obraId){
  var obra = state.obras[obraId];
  if(!obra || !canSeeObra(u, obraId)) return renderForbidden();

  var blocks = Object.values(obra.blocks || {})
    .sort(function(a,b){ return Number(String(a.id).replace(/\D/g,"")) - Number(String(b.id).replace(/\D/g,"")); })
    .map(function(b){
      var c = blockCounters(obra, b);
      return `
        <button class="card block-card js-open-block" data-block="${esc(b.id)}">
          <div class="block-card__title">${esc(b.id)}</div>
          <div class="obra-stats">
            <span class="stat stat--sem">Sem vist.: ${c.semVist}</span>
            <span class="stat stat--pend">Pend.: ${c.pend}</span>
            <span class="stat stat--feito">Feito: ${c.feito}</span>
            <span class="stat stat--conf">Conf.: ${c.conferido}</span>
            <span class="stat stat--conc">Concl.: ${c.concluido}</span>
          </div>
        </button>
      `;
    }).join("");

  var deleteBtn = canManageObras(u)
    ? `<button class="btn btn--subtle-danger btn--small" id="btnDeleteObra">Excluir obra</button>`
    : ``;

  return `
  <div class="shell">
    ${topbar(esc(obra.name), `${obra.city==="aguaslindas" ? "Águas Lindas" : "Valparaíso"} · ${obra.config && obra.config.numBlocks || 0} blocos`, `
      <button class="btn js-home">Voltar</button>
      ${deleteBtn}
      <button class="btn js-logout">Sair</button>
    `)}
    <div class="content">
      <div class="grid grid--block">${blocks}</div>
    </div>
  </div>`;
}

function renderBlock(u, obraId, blockId){
  var obra = state.obras[obraId];
  var block = obra && obra.blocks ? obra.blocks[blockId] : null;
  if(!obra || !block || !canSeeObra(u, obraId)) return renderForbidden();

  var nums = aptNumsForBlock(obra, block);

  var cards = nums.map(function(n){
    var a = getApartmentView(obraId, blockId, n);
    var st = apartmentStatus(a);

    var extra =
      st==="sem_vistoria" ? "card-apt--sem" :
      st==="pendente" ? "card-apt--pend" :
      st==="feito" ? "card-apt--feito" :
      st==="concluido" ? "card-apt--conc" :
      "card-apt--conf";

    var label =
      st==="sem_vistoria" ? "Sem vistoria" :
      st==="pendente" ? "Com pendências" :
      st==="feito" ? "Aguardando qualidade" :
      st==="concluido" ? "Concluído" :
      "Conferido";

    return `
      <button class="card apt-card ${extra} js-open-apt" data-apt="${esc(n)}">
        <div class="apt-card__num">${esc(n)}</div>
        <div class="apt-card__status">${label}</div>
      </button>`;
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

function renderApartment(u, obraId, blockId, aptNum){
  var obra = state.obras[obraId];
  var block = obra && obra.blocks ? obra.blocks[blockId] : null;
  var apt = getApartmentView(obraId, blockId, aptNum);
  if(!obra || !block || !apt || !canSeeObra(u, obraId)) return renderForbidden();

  var tabs = `
    <div class="tabs">
      <button class="tab ${routes.tab==="pendencias" ? "is-active" : ""}" data-tab="pendencias">Pendências</button>
      <button class="tab ${routes.tab==="fotos" ? "is-active" : ""}" data-tab="fotos">Fotos</button>
    </div>`;

  var body = routes.tab==="fotos"
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
  var canCreate = u.role==="qualidade" || u.role==="supervisor";
  var canDo = u.role==="execucao";
  var canDeleteOwn = u.role==="qualidade" || u.role==="supervisor";
  var canSupervisorDelete = u.role==="supervisor";

  var list = (apt.pendencias || [])
    .slice()
    .sort(function(a,b){ return new Date(b.createdAt) - new Date(a.createdAt); })
    .map(function(p){
      var badge =
        p.state==="pendente" ? `<span class="badge badge--pend">Pendente</span>` :
        p.state==="feito" ? `<span class="badge badge--feito">Aguardando qualidade</span>` :
        p.state==="conferido" ? `<span class="badge badge--conf">Conferido</span>` :
        `<span class="badge badge--conc">Concluído</span>`;

      var photos = (p.photos || []).map(function(ph){
        return `
        <a class="photo-thumb" href="${esc(ph.dataUrl || "#")}" target="_blank" rel="noopener">
          <img src="${esc(ph.dataUrl || "")}" alt="foto"/>
        </a>`;
      }).join("");

      var actions = "";

      if(canDo && p.state==="pendente"){
        actions += `<button class="btn btn--primary js-mark-done" data-p="${esc(p.id)}">Marcar como feito</button>`;
      }

      if(canQualityReview(u) && p.state==="feito"){
        actions += `
          <button class="btn btn--primary js-quality-ok" data-p="${esc(p.id)}">Aprovar</button>
          <button class="btn btn--danger js-quality-no" data-p="${esc(p.id)}">Reprovar</button>
        `;
      }

      if(canSupervisorReview(u) && p.state==="conferido"){
        actions += `
          <button class="btn btn--primary js-supervisor-ok" data-p="${esc(p.id)}">Aprovar</button>
          <button class="btn btn--danger js-supervisor-no" data-p="${esc(p.id)}">Reprovar</button>
        `;
      }

      if((canDeleteOwn && p.createdBy && p.createdBy.id===u.id) || canSupervisorDelete){
        actions += `<button class="btn btn--danger js-del-pend" data-p="${esc(p.id)}">Excluir</button>`;
      }

      return `
        <div class="card pend-card">
          <div class="row" style="justify-content:space-between; gap:8px; align-items:flex-start">
            <div>
              <div class="strong">${esc(p.title)}</div>
              <div class="small">${esc(p.category || "-")} · ${esc(p.location || "-")}</div>
              <div class="small">Criada por ${esc(p.createdBy && p.createdBy.name || "-")} em ${fmtDT(p.createdAt)}</div>
              ${p.doneAt ? `<div class="small">Feita por ${esc(p.doneBy && p.doneBy.name || "-")} em ${fmtDT(p.doneAt)}</div>` : ``}
              ${p.qualityReviewedAt ? `<div class="small">Qualidade aprovou em ${fmtDT(p.qualityReviewedAt)}</div>` : ``}
              ${p.supervisorReviewedAt ? `<div class="small">Supervisor aprovou em ${fmtDT(p.supervisorReviewedAt)}</div>` : ``}
              ${p.rejection ? `<div class="small">Última reprovação: ${esc(p.rejection)}</div>` : ``}
            </div>
            ${badge}
          </div>
          ${photos ? `<div class="photo-grid" style="margin-top:12px">${photos}</div>` : ``}
          ${actions ? `<div class="row" style="gap:8px; margin-top:12px; flex-wrap:wrap">${actions}</div>` : ``}
        </div>`;
    }).join("");

  var form = canCreate ? `
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
  var canUpload = u.role==="qualidade" || u.role==="supervisor";

  var photos = (apt.photos || [])
    .slice()
    .sort(function(a,b){ return new Date(b.createdAt) - new Date(a.createdAt); })
    .map(function(ph){
      return `
      <div class="card">
        <a class="photo-thumb photo-thumb--big" href="${esc(ph.dataUrl || "#")}" target="_blank" rel="noopener">
          <img src="${esc(ph.dataUrl || "")}" alt="foto apartamento"/>
        </a>
        <div class="small" style="margin-top:8px">${fmtDT(ph.createdAt)} · ${esc(ph.createdBy && ph.createdBy.name || "-")}</div>
        ${u.role==="qualidade" || u.role==="supervisor"
          ? `<div class="row" style="margin-top:8px"><button class="btn btn--danger js-del-apt-photo" data-ph="${esc(ph.id)}">Excluir</button></div>`
          : ``}
      </div>`;
    }).join("");

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

function bindUsers(u){
  var obraSel = $("#newUserObra");
  var obras = visibleObrasFor(u);
  obraSel.innerHTML = obras.map(function(o){ return `<option value="${esc(o.id)}">${esc(o.name)}</option>`; }).join("");

  var btnAddSup = $("#btnAddSup");
  if(btnAddSup){
    btnAddSup.onclick = function(){
      var name = prompt("Nome do supervisor:");
      if(!name) return;
      var id = slugify(prompt("Usuário (id):") || "");
      if(!id) return toast("Informe um id válido");
      var pin = (prompt("PIN:") || "").trim();
      if(!pin) return toast("Informe um PIN");
      if(state.users.some(function(x){ return x.id===id; })) return toast("ID de usuário já existe");

      state.users.push({
        id:id, name:name, role:"supervisor", pin:pin,
        obraIds:["*"], active:true, cityScope:"*"
      });
      saveState();
      render();
      toast("Supervisor criado");
    };
  }

  $("#btnCreateUser").onclick = function(){
    var name = ($("#newUserName").value || "").trim();
    var id = slugify(($("#newUserId").value || "").trim());
    var pin = ($("#newUserPin").value || "").trim();
    var role = ($("#newUserRole").value || "").trim();
    var obraId = ($("#newUserObra").value || "").trim();

    if(!name || !id || !pin) return toast("Preencha nome, usuário e PIN");
    if(state.users.some(function(x){ return x.id===id; })) return toast("ID de usuário já existe");
    if(role !== "execucao") return toast("Só é permitido criar login de execução aqui");
    if(!state.obras[obraId]) return toast("Selecione uma obra válida");

    state.users.push({
      id:id, name:name, role:role, pin:pin,
      obraIds:[obraId], active:true
    });
    saveState();
    render();
    toast("Login criado");
  };

  $$(".js-del-user").forEach(function(b){
    b.onclick = function(){
      var id = b.dataset.user;
      var user = state.users.find(function(x){ return x.id===id; });
      if(!user) return;
      if(!confirm(`Excluir o login "${user.name}"?`)) return;
      state.users = state.users.filter(function(x){ return x.id!==id; });
      saveState();
      render();
      toast("Login excluído");
    };
  });
}

function bindCreateObra(u){
  $("#btnCreateObraNow").onclick = async function(){
    var name = ($("#obraName").value || "").trim();
    var rawCode = ($("#obraCode").value || "").trim();
    var city = normalizeCity(($("#obraCity").value || "valparaiso").trim());
    var numBlocks = Math.max(1, Number($("#obraBlocks").value || 1));
    var aptsPerBlock = Number($("#obraApts").value || 16) === 12 ? 12 : 16;
    var execName = ($("#execName").value || "").trim();
    var execUser = slugify(($("#execUser").value || "").trim());
    var execPin = ($("#execPin").value || "").trim();

    if(u.role === "qualidade"){
      city = normalizeCity(u.cityScope || city);
    }

    if(!name || !execName || !execUser || !execPin) return toast("Preencha todos os campos");

    var obraId = slugify(rawCode || name);
    if(state.obras[obraId] || state.obras_index.some(function(x){ return x.id===obraId; })) return toast("ID da obra já existe");
    if(state.users.some(function(x){ return x.id===execUser; })) return toast("Usuário de execução já existe");

    var blocks = {};
    for(var i=1;i<=numBlocks;i++){
      var bid = "B" + i;
      blocks[bid] = { id:bid, apartments:{} };
    }

    state.obras[obraId] = {
      id: obraId,
      name: name,
      city: city,
      config: { numBlocks:numBlocks, aptsPerBlock:aptsPerBlock },
      blocks: blocks
    };

    state.obras_index.push({
      id: obraId,
      name: name,
      city: city,
      config: { numBlocks:numBlocks, aptsPerBlock:aptsPerBlock }
    });

    state.users.push({
      id: execUser,
      name: execName,
      role: "execucao",
      pin: execPin,
      obraIds: [obraId],
      active: true
    });

    state._meta.deletedObraIds = (state._meta.deletedObraIds || []).filter(function(x){ return x !== obraId; });
    state._meta.deletedExecIds = (state._meta.deletedExecIds || []).filter(function(x){ return x !== execUser; });

    saveState();
    toast("Obra criada com sucesso");
    goto("home");
  };
}

function bindHome(u){
  var btnUsers = $("#btnUsers");
  if(btnUsers) btnUsers.onclick = function(){ goto("users"); };

  var btnCreateObra = $("#btnCreateObra");
  if(btnCreateObra) btnCreateObra.onclick = function(){ goto("createObra"); };

  var btnHistory = $("#btnHistory");
  if(btnHistory) btnHistory.onclick = function(){ goto("history"); };

  $$(".js-open-obra").forEach(function(b){
    b.onclick = function(){ goto("obra", { obraId: b.dataset.obra }); };
  });
}

function bindObra(u, obraId){
  $$(".js-open-block").forEach(function(b){
    b.onclick = function(){ goto("block", { obraId: obraId, blockId: b.dataset.block }); };
  });

  var btnDelete = $("#btnDeleteObra");
  if(btnDelete){
    btnDelete.onclick = async function(){
      var obra = state.obras[obraId];
      if(!obra) return;

      var execUsers = state.users.filter(function(x){ return x.role === "execucao" && (x.obraIds || []).indexOf(obraId) >= 0; });
      var execMsg = execUsers.length ? `\nTambém será(ão) excluído(s) o(s) login(s): ${execUsers.map(function(x){ return x.id; }).join(", ")}` : "";

      if(!confirm(`Excluir a obra "${obra.name}"?${execMsg}\n\nEssa ação remove a obra para poder recriá-la do zero depois.`)) return;

      state._meta.deletedObraIds = Array.from(new Set((state._meta.deletedObraIds || []).concat([obraId])));
      execUsers.forEach(function(x){
        state._meta.deletedExecIds = Array.from(new Set((state._meta.deletedExecIds || []).concat([x.id])));
      });

      try{ await deleteAllApartmentDocsForObra(obraId); }catch(e){ console.warn(e); }

      state.users = state.users.filter(function(x){ return !(x.role==="execucao" && (x.obraIds || []).indexOf(obraId) >= 0); });
      delete state.obras[obraId];
      state.obras_index = state.obras_index.filter(function(x){ return x.id !== obraId; });
      state.last_obras_refresh = new Date().toISOString();

      saveState();
      toast("Obra excluída");
      goto("home");
    };
  }
}

function bindBlock(u, obraId, blockId){
  var btnBack = $("#btnBackObra");
  if(btnBack) btnBack.onclick = function(){ goto("obra", { obraId: obraId }); };

  $$(".js-open-apt").forEach(function(b){
    b.onclick = function(){ goto("apt", { obraId: obraId, blockId: blockId, aptNum: b.dataset.apt }); };
  });
}

function bindApartment(u, obraId, blockId, aptNum){
  var btnBack = $("#btnBackBlock");
  if(btnBack) btnBack.onclick = function(){ goto("block", { obraId: obraId, blockId: blockId }); };

  $$(".tab").forEach(function(t){
    t.onclick = function(){
      routes.tab = t.dataset.tab;
      render();
    };
  });

  var apt = getOrMakeApartment(obraId, blockId, aptNum);
  if(!apt) return;

  var btnAddPend = $("#btnAddPend");
  if(btnAddPend){
    btnAddPend.onclick = async function(){
      var title = ($("#pendTitle").value || "").trim();
      var category = ($("#pendCategory").value || "").trim();
      var location = ($("#pendLocation").value || "").trim();
      var files = Array.from($("#pendPhotos").files || []);
      if(!title) return toast("Informe o título");

      var photos = [];
      for(var i=0;i<files.length;i++){
        try{
          var dataUrl = await readImageAsDataURL(files[i]);
          photos.push({
            id: uid("ph"),
            name: files[i].name,
            dataUrl: dataUrl,
            createdAt: new Date().toISOString(),
            createdBy: { id:u.id, name:u.name, role:u.role }
          });
        }catch(e){
          console.warn(e);
        }
      }

      apt.pendencias.push({
        id: uid("p"),
        title: title,
        category: category,
        location: location,
        state: "pendente",
        createdAt: new Date().toISOString(),
        createdBy: { id:u.id, name:u.name, role:u.role },
        doneAt: null,
        doneBy: null,
        qualityReviewedAt: null,
        qualityReviewedBy: null,
        supervisorReviewedAt: null,
        supervisorReviewedBy: null,
        rejection: null,
        rejectionBy: null,
        rejectionAt: null,
        photos: photos
      });

      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Pendência adicionada");
    };
  }

  var btnAddAptPhotos = $("#btnAddAptPhotos");
  if(btnAddAptPhotos){
    btnAddAptPhotos.onclick = async function(){
      var files = Array.from($("#aptPhotos").files || []);
      if(!files.length) return toast("Selecione ao menos uma foto");

      for(var i=0;i<files.length;i++){
        try{
          var dataUrl = await readImageAsDataURL(files[i]);
          apt.photos.push({
            id: uid("aph"),
            name: files[i].name,
            dataUrl: dataUrl,
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

  $$(".js-del-apt-photo").forEach(function(b){
    b.onclick = async function(){
      var phId = b.dataset.ph;
      if(!confirm("Excluir esta foto?")) return;
      apt.photos = (apt.photos || []).filter(function(x){ return x.id !== phId; });
      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Foto excluída");
    };
  });

  $$(".js-mark-done").forEach(function(b){
    b.onclick = async function(){
      var p = (apt.pendencias || []).find(function(x){ return x.id===b.dataset.p; });
      if(!p) return;
      p.state = "feito";
      p.doneAt = new Date().toISOString();
      p.doneBy = { id:u.id, name:u.name, role:u.role };
      p.qualityReviewedAt = null;
      p.qualityReviewedBy = null;
      p.supervisorReviewedAt = null;
      p.supervisorReviewedBy = null;
      p.rejection = null;
      p.rejectionBy = null;
      p.rejectionAt = null;
      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Marcado como feito");
    };
  });

  $$(".js-quality-ok").forEach(function(b){
    b.onclick = async function(){
      var p = (apt.pendencias || []).find(function(x){ return x.id===b.dataset.p; });
      if(!p) return;
      p.state = "conferido";
      p.qualityReviewedAt = new Date().toISOString();
      p.qualityReviewedBy = { id:u.id, name:u.name, role:u.role };
      p.rejection = null;
      p.rejectionBy = null;
      p.rejectionAt = null;
      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Qualidade aprovou");
    };
  });

  $$(".js-quality-no").forEach(function(b){
    b.onclick = async function(){
      var p = (apt.pendencias || []).find(function(x){ return x.id===b.dataset.p; });
      if(!p) return;
      var reason = prompt("Motivo da reprovação:") || "";
      p.state = "pendente";
      p.qualityReviewedAt = null;
      p.qualityReviewedBy = null;
      p.supervisorReviewedAt = null;
      p.supervisorReviewedBy = null;
      p.rejection = reason.trim();
      p.rejectionBy = { id:u.id, name:u.name, role:u.role };
      p.rejectionAt = new Date().toISOString();
      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Qualidade reprovou");
    };
  });

  $$(".js-supervisor-ok").forEach(function(b){
    b.onclick = async function(){
      var p = (apt.pendencias || []).find(function(x){ return x.id===b.dataset.p; });
      if(!p) return;
      p.state = "concluido";
      p.supervisorReviewedAt = new Date().toISOString();
      p.supervisorReviewedBy = { id:u.id, name:u.name, role:u.role };
      p.rejection = null;
      p.rejectionBy = null;
      p.rejectionAt = null;
      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Supervisor aprovou");
    };
  });

  $$(".js-supervisor-no").forEach(function(b){
    b.onclick = async function(){
      var p = (apt.pendencias || []).find(function(x){ return x.id===b.dataset.p; });
      if(!p) return;
      var reason = prompt("Motivo da reprovação:") || "";
      p.state = "pendente";
      p.supervisorReviewedAt = null;
      p.supervisorReviewedBy = null;
      p.rejection = reason.trim();
      p.rejectionBy = { id:u.id, name:u.name, role:u.role };
      p.rejectionAt = new Date().toISOString();
      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Supervisor reprovou");
    };
  });

  $$(".js-del-pend").forEach(function(b){
    b.onclick = async function(){
      var p = (apt.pendencias || []).find(function(x){ return x.id===b.dataset.p; });
      if(!p) return;
      if(!(u.role==="supervisor" || ((u.role==="qualidade" || u.role==="supervisor") && p.createdBy && p.createdBy.id===u.id))){
        return toast("Você não pode excluir esta pendência");
      }
      if(!confirm("Excluir esta pendência?")) return;
      apt.pendencias = (apt.pendencias || []).filter(function(x){ return x.id !== p.id; });
      try{ await saveApartmentDoc(obraId, blockId, aptNum); }catch(e){ console.warn(e); }
      saveState();
      render();
      toast("Pendência excluída");
    };
  });
}

function renderHistory(u){
  var rows = allHistoryEntries();
  var filter = routes.historyFilter || "all";
  var filtered = filter === "all"
    ? rows
    : rows.filter(function(r){ return slugify(r.type) === slugify(filter); });

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
          <button class="btn ${filter==="Concluída" ? "btn--primary" : ""} js-hf" data-f="Concluída">Concluídas</button>
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
            ${filtered.map(function(r){
              return `
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
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function bindHistory(){
  $$(".js-hf").forEach(function(b){
    b.onclick = function(){
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

(function injectCssFixes(){
  var css = `
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
  .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;color:var(--text)}
  .login-card{width:min(440px,92vw)}
  .form{display:grid;gap:10px;margin-top:12px}
  .form.grid2{grid-template-columns:repeat(2,minmax(0,1fr))}
  @media (max-width:720px){.form.grid2{grid-template-columns:1fr}}
  label{font-size:13px;color:var(--muted)}
  input,select{width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:#0b1220;color:var(--text);outline:none}
  input::placeholder{color:#94a3b8}
  .btn{border:1px solid var(--line);background:#0b1220;color:var(--text);padding:10px 14px;border-radius:12px;cursor:pointer}
  .btn:hover{filter:brightness(1.08)}
  .btn--block{width:100%}
  .btn--small{padding:7px 10px;font-size:12px}
  .btn--primary{background:var(--primary);border-color:#1d4ed8}
  .btn--orange{background:var(--orange);border-color:#c2410c}
  .btn--danger{background:var(--danger);border-color:#b91c1c}
  .btn--subtle-danger{background:var(--danger-soft);border-color:var(--danger-soft-border);color:#e5e7eb}
  .grid{display:grid;gap:14px}
  .grid--obra{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
  .grid--block{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
  .grid--apt{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}
  .obra-card,.block-card,.apt-card{text-align:left;cursor:pointer;background:var(--card-2);min-height:110px}
  .obra-card__title,.block-card__title,.apt-card__num{font-size:20px;font-weight:700}
  .obra-card__meta,.apt-card__status{font-size:13px;color:var(--muted);margin-top:6px}
  .obra-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
  .stat{font-size:12px;padding:6px 8px;border-radius:999px;border:1px solid transparent;background:#0b1220;text-align:center;white-space:nowrap}
  .stat--sem{border-color:#475569;background:#1e293b}
  .stat--pend{border-color:#854d0e;background:#3f2b05}
  .stat--feito{border-color:#1d4ed8;background:#102a56}
  .stat--conf{border-color:#166534;background:#0f2a1c}
  .stat--conc{border-color:#0f766e;background:#113a37}
  .badge{font-size:12px;padding:6px 10px;border-radius:999px;border:1px solid transparent;white-space:nowrap}
  .badge--pend{border-color:#854d0e;background:#3f2b05}
  .badge--feito{border-color:#1d4ed8;background:#102a56}
  .badge--conf{border-color:#166534;background:#0f2a1c}
  .badge--conc{border-color:#0f766e;background:#113a37}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
  .tab{padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:#0b1220;color:var(--text);cursor:pointer}
  .tab.is-active{background:var(--primary);border-color:#1d4ed8}
  .stack{display:grid;gap:12px}
  .row{display:flex;align-items:center}
  .row--user{justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}
  .list{margin-top:12px}
  .photo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px}
  .photo-thumb{display:block;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:#0b1220}
  .photo-thumb img{display:block;width:100%;height:110px;object-fit:cover}
  .photo-thumb--big img{height:auto;max-height:420px;object-fit:contain;background:#020617}
  .table{width:100%;border-collapse:collapse}
  .table th,.table td{padding:10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:13px}
  .city-group{margin-bottom:22px}
  .city-line{color:#e2e8f0;font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:0 0 12px 2px;padding:0;background:transparent !important;border:none !important;box-shadow:none !important}
  .apt-card{background:#1f2937;color:#f8fafc}
  .card-apt--sem{background:#243244;border-color:#506273}
  .card-apt--pend{background:#3a2a12;border-color:#8b5a1c}
  .card-apt--feito{background:#14263f;border-color:#274c7a}
  .card-apt--conf{background:#163222;border-color:#2a6b46}
  .card-apt--conc{background:#123734;border-color:#1f7a73}
  #toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#020617;color:#fff;padding:12px 16px;border-radius:12px;border:1px solid #334155;display:none;z-index:9999}
  `;
  var style = document.createElement("style");
  style.id = "bm-style-fixes";
  style.textContent = css;
  document.head.appendChild(style);
})();

(function ensureToast(){
  var t = document.getElementById("toast");
  if(!t){
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
})();

window.addEventListener("error", function(){
  try{
    var box = document.getElementById("fatalAppError");
    if(!box){
      box = document.createElement("div");
      box.id = "fatalAppError";
      box.style.position = "fixed";
      box.style.left = "12px";
      box.style.right = "12px";
      box.style.top = "12px";
      box.style.zIndex = "99999";
      box.style.background = "#7f1d1d";
      box.style.color = "#fff";
      box.style.padding = "12px";
      box.style.borderRadius = "12px";
      box.style.fontSize = "14px";
      box.style.lineHeight = "1.4";
      document.body.appendChild(box);
    }
    box.textContent = "Erro ao abrir o app neste aparelho. Feche e abra novamente. Se continuar, limpe os dados do navegador.";
  }catch(_){}
});

(function rebuildIndexIfNeeded(){
  if(!Array.isArray(state.obras_index)) state.obras_index = [];
  var ids = new Set(state.obras_index.map(function(x){ return x.id; }));
  Object.values(state.obras || {}).forEach(function(o){
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
  state.obras_index = state.obras_index.filter(function(x){ return !!state.obras[x.id]; });
  state.obras_index.sort(function(a,b){ return a.name.localeCompare(b.name, "pt-BR"); });
})();

(function validateSession(){
  var u = getCurrentUser();
  if(state.session && !u){
    state.session = null;
    setSessionUserId("");
    saveState();
  }
})();

window.BM_APP = {
  getState: function(){ return state; },
  saveState: saveState,
  render: render,
  goto: goto,
  logout: logout
};

ensureSystemDefaults();
initFirestore();
render();
