
/* Bela Mares — Checklist (v19) */
/* Sem Service Worker para evitar cache travado em testes. */

const STORAGE_KEY = "bm_checklist_v22";

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

function uid(prefix="id"){
  return prefix + "_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

const APT_NUMS_12 = ["101","102","103","104","201","202","203","204","301","302","303","304"];
const APT_NUMS_16 = ["101","102","103","104","105","106","107","108","201","202","203","204","205","206","207","208"];

function seed(){
  const state = {
    version: 22,
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

  function makeObra(id, name, numBlocks, aptsPerBlock){
    const blocks = {};
    for(let b=1;b<=numBlocks;b++){
      const bid = "B"+b;
      const apartments = {};
      const nums = (aptsPerBlock===12) ? APT_NUMS_12 : (aptsPerBlock===16 ? APT_NUMS_16 : APT_NUMS_12); // (se você quiser 16 depois, a gente coloca)
      nums.forEach(n=>{
        apartments[n] = { num:n, pendencias: [] };
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
    reopenedAt:null
  });

  return state;
}

function loadState(){
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
let state = loadState();

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currentUser(){
  const sid = state.session?.userId;
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
  const logout = $("#btnLogout");
  const back = $("#btnBack");

  if(u){
    chip.style.display = "inline-flex";
    chip.textContent = `${u.name} • ${u.role}`;
    logout.style.display = "inline-flex";
  }else{
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

  // fallback
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
            <input id="loginUser" class="input" placeholder="ex.: qualidade_01" autocomplete="username" />
          </div>
          <div>
            <div class="small">PIN</div>
            <input id="loginPin" class="input" placeholder="ex.: 2222" inputmode="numeric" autocomplete="current-password" />
          </div>
          <div class="row">
            <button id="btnLogin" class="btn btn--orange">Entrar</button>
            <button id="btnReset" class="btn btn--ghost">Zerar dados</button>
          </div>
          <div class="small">Dica: use os logins de teste (qualidade_01/2222, supervisor_01/3333, diretor/9999).</div>
        </div>
      </div>

      <div class="card">
        <div class="h2">Obras cadastradas</div>
        <div class="small">Costa Rica e Costa Brava já vêm prontas.</div>
        <div class="hr"></div>
        <table class="table">
          <thead>
            <tr>
              <th>Obra</th>
              <th class="small">Blocos</th>
              <th class="small">Apto/Bloco</th>
            </tr>
          </thead>
          <tbody>
            ${state.obras_index.map(o=>`
              <tr>
                <td><b>${esc(o.name)}</b></td>
                <td class="small">${o.config.numBlocks}</td>
                <td class="small">${o.config.aptsPerBlock}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  $("#btnReset").onclick = ()=>{
    state = seed();
    saveState();
    toast("Dados zerados.");
    render();
  };

  $("#btnLogin").onclick = ()=>{
    const id = ($("#loginUser").value||"").trim();
    const pin = ($("#loginPin").value||"").trim();
    const user = state.users.find(u=>u.id===id && u.active);
    if(!user){ toast("Usuário inválido"); return; }
    if(user.pin !== pin){ toast("PIN incorreto"); return; }
    state.session = { userId: user.id };
    saveState();
    // route
    if(user.role==="execucao"){
      const obraId = (user.obraIds||[])[0];
      goto("obra", { obraId });
    }else if(canViewOnly(user)){
      goto("dash");
    }else{
      goto("home");
    }
  };
}

function renderDash(root){
  const u = currentUser();
  if(!u) return goto("login");
  if(!canViewOnly(u)) return goto("home");

  const stats = state.obras_index.map(o=>{
    const s = calcObraStats(o.id);
    return { id:o.id, name:o.name, ...s };
  });
  const total = stats.reduce((a,s)=>({ total:a.total+s.total, conclu:a.conclu+s.conclu, aguard:a.aguard+s.aguard, pend:a.pend+s.pend }), {total:0, conclu:0, aguard:0, pend:0});

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
          <div class="kpi__v">${total.conclu}</div>
          <div class="kpi__l">Concluídos (conferidos)</div>
        </div>
        <div class="kpi">
          <div class="kpi__v">${total.aguard}</div>
          <div class="kpi__l">Aguardando conferência</div>
        </div>
        <div class="kpi">
          <div class="kpi__v">${total.pend}</div>
          <div class="kpi__l">Com pendência</div>
        </div>
      </div>

      <div class="hr"></div>

      <table class="table">
        <thead>
          <tr>
            <th>Obra</th>
            <th class="small" style="text-align:center">Concluídos</th>
            <th class="small" style="text-align:center">Aguardando</th>
            <th class="small" style="text-align:center">Pendência</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${stats.map(s=>`
            <tr>
              <td><b>${esc(s.name)}</b><div class="small">Total: ${s.total}</div></td>
              <td style="text-align:center"><b>${s.conclu}</b></td>
              <td style="text-align:center"><b>${s.aguard}</b></td>
              <td style="text-align:center"><b>${s.pend}</b></td>
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
}

function renderHome(root){
  const u = currentUser();
  if(!u) return goto("login");
  if(canViewOnly(u)) return goto("dash");

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
            <button id="btnReset2" class="btn btn--ghost">Zerar dados</button>
          </div>
        </div>
        <div class="hr"></div>
        <table class="table">
          <thead>
            <tr>
              <th>Obra</th>
              <th class="small" style="text-align:center">Concluídos</th>
              <th class="small" style="text-align:center">Aguardando</th>
              <th class="small" style="text-align:center">Pendência</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${state.obras_index.map(o=>{
              const s = calcObraStats(o.id);
              return `
                <tr>
                  <td><b>${esc(o.name)}</b><div class="small">${o.config.numBlocks} blocos • ${o.config.aptsPerBlock} apto/bloco</div></td>
                  <td style="text-align:center"><b>${s.conclu}</b></td>
                  <td style="text-align:center"><b>${s.aguard}</b></td>
                  <td style="text-align:center"><b>${s.pend}</b></td>
                  <td style="text-align:right"><button class="btn" data-open="${esc(o.id)}">Abrir</button> ${canDeleteObra(u) ? `<button class="btn btn--red" data-del="${esc(o.id)}">Apagar</button>` : ``}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="h2">Permissões</div>
        <div class="small">Regras principais do protótipo.</div>
        <div class="hr"></div>
        <div class="pills">
          <span class="badge"><span class="dot dot--o"></span> Aguardando</span>
          <span class="badge"><span class="dot dot--r"></span> Pendência</span>
          <span class="badge"><span class="dot dot--g"></span> Concluído</span>
        </div>
        <div class="hr"></div>
        <div class="small">
          <b>Qualidade / Supervisor</b>: adicionam pendências. Supervisor confere (aprovar/reprovar). Qualidade pode reabrir.<br><br>
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
              <div class="small">Somente Qualidade e Supervisor</div>
            </div>
            <button class="btn btn--ghost" id="mClose">✕</button>
          </div>
          <div class="hr"></div>
          <div class="grid">
            <div>
              <div class="small">Nome da obra</div>
              <input id="mObraName" class="input" placeholder="Ex.: Paraty - Entregas" />
            </div>
            <div>
              <div class="small">Código (opcional)</div>
              <input id="mObraId" class="input" placeholder="Ex.: paraty" />
            </div>
            <div>
              <div class="small">Criar login da Execução (1 por obra)</div>
              <div class="grid" style="grid-template-columns:1fr 1fr; gap:10px">
                <div>
                  <div class="small">Usuário Execução</div>
                  <input id="mExecUser" class="input" placeholder="Ex.: exec_paraty" />
                </div>
                <div>
                  <div class="small">PIN Execução (4 dígitos)</div>
                  <input id="mExecPin" class="input" inputmode="numeric" placeholder="Ex.: 1234" />
                </div>
              </div>
            </div>
            <div>
            </div>
            <div class="grid" style="grid-template-columns:1fr 1fr; gap:10px">
              <div>
                <div class="small">Blocos</div>
                <input id="mBlocks" class="input" inputmode="numeric" placeholder="Ex.: 10" />
              </div>
              <div>
                <div class="small">Apto por bloco</div>
                <select id="mApts" class="input">
                  <option value="12">12</option>
                  <option value="16">16</option>
                </select>
              </div>
            </div>
            <div class="row" style="justify-content:flex-end">
              <button id="mAddObra" class="btn btn--orange">Adicionar</button>
            </div>
          </div>
        </div>
      `);
      $("#mClose", backdrop).onclick = close;
      $("#mAddObra", backdrop).onclick = ()=>{
        const name = ($("#mObraName", backdrop).value||"").trim();
        const blocks = Number(($("#mBlocks", backdrop).value||"").trim());
        const apts = Number($("#mApts", backdrop).value);
        if(!name){ toast("Informe o nome."); return; }
        if(!blocks || blocks<1 || blocks>60){ toast("Blocos inválido."); return; }
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
        const r = addObra(id, name, blocks, apts);
        if(!r.ok){ toast(r.msg); return; }

        // criar (opcional) login de execução 1 por obra
        const execUser = (($("#mExecUser", backdrop).value||"").trim());
        const execPin  = (($("#mExecPin", backdrop).value||"").trim());

        if(execUser || execPin){
          if(!execUser){ toast("Informe o usuário da Execução."); return; }
          if(!/^[0-9]{4}$/.test(execPin)){ toast("PIN da Execução deve ter 4 dígitos."); return; }

          // garante 1 login de execução por obra
          const already = state.users.find(u=>u.role==="execucao" && (u.obraIds||[])[0]===id && u.active);
          if(already){
            toast("Já existe Execução para essa obra.");
            return;
          }
          const exists = state.users.find(u=>u.id===execUser);
          if(exists){
            toast("Usuário de Execução já existe.");
            return;
          }
          state.users.push({ id: execUser, name: "Execução " + name, role:"execucao", pin: execPin, obraIds:[id], active:true });
          saveState();
        }

        close();
        toast("Obra adicionada!");
        goto("home");
      };
    };
  }

  $$('button[data-del]').forEach(btn=>{
    btn.onclick = ()=>{
      const u = currentUser();
      if(!canDeleteObra(u)) return toast("Sem permissão.");
      const obraId = btn.getAttribute("data-del");
      const obra = state.obras[obraId];
      const ok = confirm(`Apagar a obra "${obra?.name||obraId}"?\n\nIsso remove do app (irreversível no protótipo).`);
      if(!ok) return;
      deleteObra(obraId);
      toast("Obra apagada.");
      goto("home");
    };
  });

  $("#btnUsers").onclick = ()=> goto("users");

  $("#btnReset2").onclick = ()=>{
    state = seed();
    saveState();
    toast("Dados zerados.");
    goto("home");
  };
  $$('button[data-open]').forEach(b=>{
    b.onclick=()=>goto("obra",{ obraId: b.getAttribute("data-open") });
  });
}

function renderObra(root){
  const u = currentUser();
  if(!u) return goto("login");

  const obraId = nav.params.obraId;
  const obra = state.obras[obraId];
  if(!obra){ toast("Obra não encontrada"); return goto(canViewOnly(u) ? "dash" : "home"); }

  // execução só pode na obra vinculada
  if(u.role==="execucao" && !(u.obraIds||[]).includes(obraId)){
    toast("Sem permissão.");
    return goto("login");
  }

  const blocks = Object.keys(obra.blocks);

  root.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <div class="h1">${esc(obra.name)}</div>
          <div class="small">${obra.config.numBlocks} blocos • ${obra.config.aptsPerBlock} apto/bloco</div>
        </div>
        <div class="row" style="gap:8px">
          ${canViewOnly(u) ? "" : `<button class="btn" id="btnHome">Obras</button>`}
          <button class="btn" id="btnDash2">Visão Geral</button>
        </div>
      </div>

      <div class="hr"></div>
      <div class="small">Escolha o bloco:</div>
      <div class="pills" id="blockPills">
        ${blocks.map(b=>`<div class="pill" data-b="${b}">${b.replace("B","Bloco ")}</div>`).join("")}
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="card" id="blockArea">
      <div class="small">Selecione um bloco acima.</div>
    </div>
  `;

  if($("#btnHome")) $("#btnHome").onclick = ()=> goto("home");
  $("#btnDash2").onclick = ()=> goto("dash");

  const blockArea = $("#blockArea");
  $$('#blockPills .pill').forEach(p=>{
    p.onclick = ()=>{
      $$('#blockPills .pill').forEach(x=>x.classList.remove("pill--active"));
      p.classList.add("pill--active");
      const blockId = p.getAttribute("data-b");
      renderBlock(blockArea, obraId, blockId);
    };
  });
}

function renderBlock(container, obraId, blockId){
  const obra = state.obras[obraId];
  const block = obra.blocks[blockId];
  const u = currentUser();

  const apts = Object.values(block.apartments).sort((a,b)=>Number(a.num)-Number(b.num));

  container.innerHTML = `
    <div class="row">
      <div>
        <div class="h2">${blockId.replace("B","Bloco ")}</div>
        <div class="small">Toque em um apartamento para ver pendências.</div>
      </div>
      <div class="small">Legenda: <span class="badge"><span class="dot dot--g"></span> ok</span></div>
    </div>
    <div class="hr"></div>
    <div class="apts">
      ${apts.map(a=>{
        const st = aptStatus(a);
        const dot = st.dot ? `<span class="dot dot--${st.dot}"></span>` : `<span class="dot" style="background:rgba(255,255,255,.12)"></span>`;
        const ok = st.dot==="g" ? "✓" : "";
        return `
          <div class="apt" data-ap="${esc(a.num)}">
            <div class="row" style="align-items:flex-start">
              <div class="apt__n">${esc(a.num)}</div>
              <div style="font-weight:900;color:rgba(255,255,255,.8)">${ok}</div>
            </div>
            <div class="apt__s">${dot}<span>${esc(st.label)}</span></div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  $$('.apt', container).forEach(el=>{
    el.onclick = ()=>{
      const apto = el.getAttribute("data-ap");
      goto("apto", { obraId, blockId, apto });
    };
  });
}

function renderApto(root){
  const u = currentUser();
  if(!u) return goto("login");

  const { obraId, blockId, apto } = nav.params;
  const obra = state.obras[obraId];
  const block = obra?.blocks?.[blockId];
  const apt = block?.apartments?.[apto];
  if(!apt){ toast("Apartamento não encontrado"); return goto("obra",{ obraId }); }

  // execução só pode na obra vinculada
  if(u.role==="execucao" && !(u.obraIds||[]).includes(obraId)){
    toast("Sem permissão.");
    return goto("login");
  }

  const st = aptStatus(apt);

  root.innerHTML = `
    <div class="grid2">
      <div class="card">
        <div class="row">
          <div>
            <div class="h1">${esc(obra.name)}</div>
            <div class="small">${blockId.replace("B","Bloco ")} • Apto ${esc(apto)}</div>
          </div>
          <div class="badge">
            ${st.dot ? `<span class="dot dot--${st.dot}"></span>` : `<span class="dot" style="background:rgba(255,255,255,.12)"></span>`}
            <span>${esc(st.label)}</span>
          </div>
        </div>

        <div class="hr"></div>

        <div class="row">
          <div class="h2">Pendências</div>
          ${canCreate(u) ? `<button id="btnAddPend" class="btn btn--orange">+ Adicionar</button>` : ``}
        </div>

        <div class="hr"></div>

        <div id="pendList" class="grid"></div>
      </div>

      <div class="card">
        <div class="h2">Ações</div>
        <div class="small">Permissões por perfil.</div>
        <div class="hr"></div>
        <div class="small">
          <b>Execução</b>: marcar como FEITO.<br>
          <b>Supervisor</b>: aprovar/reprovar (conferência).<br>
          <b>Qualidade/Supervisor</b>: reabrir.
        </div>
      </div>
    </div>
  `;

  if($("#btnAddPend")){
    $("#btnAddPend").onclick = ()=> openAddPendencia(obraId, blockId, apto);
  }

  renderPendencias($("#pendList"), obraId, blockId, apto);
}

function renderPendencias(container, obraId, blockId, apto){
  const u = currentUser();
  const apt = state.obras[obraId].blocks[blockId].apartments[apto];
  const ps = apt.pendencias || [];

  if(ps.length===0){
    container.innerHTML = `<div class="small">Nenhuma pendência cadastrada.</div>`;
    return;
  }

  container.innerHTML = ps.map(p=>{
    const badge = (p.state==="conferido") ? `<span class="badge"><span class="dot dot--g"></span> Conferido</span>`
                : (p.state==="feito") ? `<span class="badge"><span class="dot dot--o"></span> Feito</span>`
                : (p.state==="reprovado") ? `<span class="badge"><span class="dot dot--r"></span> Reprovado</span>`
                : `<span class="badge"><span class="dot dot--r"></span> Pendente</span>`;

    const canDo = canMarkDone(u) && (p.state==="pendente" || p.state==="reprovado");
    const canApprove = canReview(u) && (p.state==="feito");
    const canReopenP = canReopen(u) && (p.state==="reprovado" || p.state==="feito" || p.state==="conferido");

    return `
      <div class="card" style="padding:12px">
        <div class="row">
          <div>
            <div style="font-weight:900">${esc(p.title)}</div>
            <div class="small">${esc(p.category||"")} ${p.location ? "• "+esc(p.location) : ""}</div>
            <div class="small">Criado por: <b>${esc(p.createdBy?.name||"-")}</b></div>
          </div>
          ${badge}
        </div>

        <div class="hr" style="margin:10px 0"></div>

        <div class="row" style="gap:8px; flex-wrap:wrap; justify-content:flex-end">
          ${canDo ? `<button class="btn btn--orange" data-act="feito" data-id="${esc(p.id)}">Marcar FEITO</button>` : ``}
          ${canApprove ? `<button class="btn btn--green" data-act="aprovar" data-id="${esc(p.id)}">Aprovar</button>
                          <button class="btn btn--red" data-act="reprovar" data-id="${esc(p.id)}">Reprovar</button>` : ``}
          ${canReopenP ? `<button class="btn" data-act="reabrir" data-id="${esc(p.id)}">Reabrir</button>` : ``}
        </div>

        ${p.rejection?.note ? `<div class="small" style="margin-top:8px"><b>Reprovação:</b> ${esc(p.rejection.note)}</div>` : ``}
      </div>
    `;
  }).join("");

  $$("button[data-act]", container).forEach(btn=>{
    btn.onclick = ()=>{
      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");
      if(act==="feito") return actFeito(obraId, blockId, apto, id);
      if(act==="aprovar") return actAprovar(obraId, blockId, apto, id);
      if(act==="reprovar") return actReprovar(obraId, blockId, apto, id);
      if(act==="reabrir") return actReabrir(obraId, blockId, apto, id);
    };
  });
}

function findPend(obraId, blockId, apto, pendId){
  const apt = state.obras[obraId].blocks[blockId].apartments[apto];
  const p = (apt.pendencias||[]).find(x=>x.id===pendId);
  return { apt, p };
}

function actFeito(obraId, blockId, apto, pendId){
  const u = currentUser();
  if(!canMarkDone(u)){ toast("Sem permissão."); return; }
  const { p } = findPend(obraId, blockId, apto, pendId);
  if(!p) return;
  p.state = "feito";
  p.doneAt = new Date().toISOString();
  p.doneBy = { id:u.id, name:u.name, role:u.role };
  saveState();
  toast("Marcado como FEITO.");
  render();
}

function actAprovar(obraId, blockId, apto, pendId){
  const u = currentUser();
  if(!canReview(u)){ toast("Sem permissão."); return; }
  const { p } = findPend(obraId, blockId, apto, pendId);
  if(!p) return;
  p.state = "conferido";
  p.reviewedAt = new Date().toISOString();
  p.reviewedBy = { id:u.id, name:u.name, role:u.role };
  p.rejection = null;
  saveState();
  toast("Conferido (aprovado).");
  render();
}

function actReprovar(obraId, blockId, apto, pendId){
  const u = currentUser();
  if(!canReview(u)){ toast("Sem permissão."); return; }
  const note = prompt("Motivo da reprovação (curto):") || "";
  const { p } = findPend(obraId, blockId, apto, pendId);
  if(!p) return;
  p.state = "reprovado";
  p.reviewedAt = new Date().toISOString();
  p.reviewedBy = { id:u.id, name:u.name, role:u.role };
  p.rejection = { note, at: new Date().toISOString(), by: { id:u.id, name:u.name } };
  saveState();
  toast("Reprovado.");
  render();
}

function actReabrir(obraId, blockId, apto, pendId){
  const u = currentUser();
  if(!canReopen(u)){ toast("Sem permissão."); return; }
  const { p } = findPend(obraId, blockId, apto, pendId);
  if(!p) return;
  p.state = "pendente";
  p.reopenedAt = new Date().toISOString();
  saveState();
  toast("Reaberto.");
  render();
}

function openAddPendencia(obraId, blockId, apto){
  const u = currentUser();
  if(!canCreate(u)){ toast("Sem permissão."); return; }

  const backdrop = document.createElement("div");
  backdrop.className = "modalBackdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <div class="row">
        <div>
          <div class="h2">Adicionar pendência</div>
          <div class="small">${esc(blockId.replace("B","Bloco "))} • Apto ${esc(apto)}</div>
        </div>
        <button class="btn btn--ghost" id="mClose">✕</button>
      </div>
      <div class="hr"></div>
      <div class="grid">
        <div>
          <div class="small">Título</div>
          <input id="mTitle" class="input" placeholder="Ex.: Ajustar porta / Rejunte / Vazamento..." />
        </div>
        <div class="grid" style="grid-template-columns:1fr 1fr; gap:10px">
          <div>
            <div class="small">Categoria</div>
            <input id="mCat" class="input" placeholder="Ex.: Hidráulica" />
          </div>
          <div>
            <div class="small">Local</div>
            <input id="mLoc" class="input" placeholder="Ex.: Banheiro / Cozinha" />
          </div>
        </div>
        <div class="row" style="justify-content:flex-end">
          <button id="mAdd" class="btn btn--orange">Adicionar</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = ()=> backdrop.remove();
  $("#mClose", backdrop).onclick = close;
  backdrop.addEventListener("click", (e)=>{ if(e.target===backdrop) close(); });

  $("#mAdd", backdrop).onclick = ()=>{
    const title = ($("#mTitle", backdrop).value||"").trim();
    const category = ($("#mCat", backdrop).value||"").trim();
    const location = ($("#mLoc", backdrop).value||"").trim();
    if(!title){ toast("Informe o título."); return; }

    const apt = state.obras[obraId].blocks[blockId].apartments[apto];
    apt.pendencias.push({
      id: uid("p"),
      title, category, location,
      state: "pendente",
      createdAt: new Date().toISOString(),
      createdBy: { id:u.id, name:u.name, role:u.role },
      doneAt:null, doneBy:null,
      reviewedAt:null, reviewedBy:null,
      rejection:null,
      reopenedAt:null
    });
    saveState();
    close();
    toast("Pendência adicionada.");
    render();
  };
}


function openModal(html){
  const backdrop = document.createElement("div");
  backdrop.className = "modalBackdrop";
  backdrop.innerHTML = html;
  document.body.appendChild(backdrop);
  const close = ()=> backdrop.remove();
  backdrop.addEventListener("click",(e)=>{ if(e.target===backdrop) close(); });
  return { backdrop, close };
}

function addObra(id, name, numBlocks, aptsPerBlock){
  id = slugify(id);
  if(!id) return { ok:false, msg:"ID inválido" };
  if(state.obras[id]) return { ok:false, msg:"Já existe uma obra com esse ID" };

  // cria obra
  const blocks = {};
  for(let b=1;b<=Number(numBlocks);b++){
    const bid="B"+b;
    const apartments={};
    const nums = (Number(aptsPerBlock)===16) ? APT_NUMS_16 : APT_NUMS_12;
    nums.forEach(n=>apartments[n]={ num:n, pendencias:[] });
    blocks[bid]={ id:bid, apartments };
  }
  const obra={ id, name, config:{ numBlocks:Number(numBlocks), aptsPerBlock:Number(aptsPerBlock) }, blocks };
  state.obras[id]=obra;
  state.obras_index.push({ id, name, config: obra.config });
  saveState();
  return { ok:true, msg:"Obra adicionada!" };
}

function deleteObra(obraId){
  delete state.obras[obraId];
  state.obras_index = state.obras_index.filter(o=>o.id!==obraId);
  // remove usuários de execução vinculados exclusivamente a essa obra (opcional: manter)
  state.users = state.users.map(u=>{
    if(u.role==="execucao" && (u.obraIds||[]).includes(obraId)){
      return { ...u, active:false };
    }
    return u;
  });
  saveState();
}


function renderUsers(root){
  const u = currentUser();
  if(!u) return goto("login");
  if(!canManageUsers(u)) { toast("Sem permissão."); return goto(canViewOnly(u) ? "dash" : "home"); }

  const active = state.users.filter(x=>x.active);
  root.innerHTML = `
    <div class="grid2">
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
                    <button class="btn" data-pin="${esc(x.id)}">Alterar PIN</button>
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

    const obraName = state.obras[obraId]?.name || obraId;
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
      target.active = false;
      if(state.session?.userId===id){
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

// boot
(function boot(){
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
