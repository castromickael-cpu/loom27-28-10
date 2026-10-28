/* =====================================================================
   Loom — script.js (conectado ao Supabase)
   Requer, antes dele: supabase-js (CDN) e supabase-config.js (define `sb`).
   ===================================================================== */

/* Resolve quando a sessão e a página terminaram de carregar.
   As páginas usam:  loomPronto.then(() => { ... })  */
const loomPronto = new Promise(res => { window.__loomResolve = res; });

let EU = null;      // meu perfil (normalizado)
let PREFS = {};     // minhas preferências (tabela preferencias)

/* ---------- utilidades ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugUser = v => (v || "").trim().toLowerCase().replace(/^@/, "");
const novoId = () => (window.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const CURSOS = { DS: "Desenvolvimento de Sistemas", ADM: "Administração", PRT: "Portos", BIO: "Bioeconomia" };

function meuUsuario() { return EU ? EU.user : ""; }
function turmaTexto(u) { return `${u.ano}º Ano • ${u.curso}`; }

/* linha do banco (v_perfis / profiles) -> objeto usado pela interface */
function norm(r) {
  if (!r) return null;
  return {
    id: r.id, user: r.username, nome: r.nome, curso: r.curso, ano: r.ano, bio: r.bio || "",
    img: r.avatar_url || "", banner: r.banner_url || "",
    views: r.views ?? null, seguidores: r.seguidores ?? 0, seguindo: r.seguindo ?? 0, posts: r.posts ?? 0,
    verificado: !!r.verificado, is_admin: !!r.is_admin,
    mostrar_online: r.mostrar_online !== false, mostrar_views: r.mostrar_views !== false,
    ultimo_acesso: r.ultimo_acesso || null,
  };
}
function avatarUsuario(u) {
  if (u.img) return u.img;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#5a7b8d"/><text x="50" y="66" font-size="48" font-family="Arial" font-weight="700" text-anchor="middle" fill="#fff">${esc((u.nome || "?")[0].toUpperCase())}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}
function estaOnline(u) {
  return u.mostrar_online && u.ultimo_acesso && (Date.now() - new Date(u.ultimo_acesso).getTime()) < 5 * 60 * 1000;
}

/* ---------- tema / aparência ---------- */
function initTheme() {
  const saved = localStorage.getItem("wrmThemeMode") || "light";
  if (saved === "light") document.body.classList.add("light");
  updateThemeIcon();
}
function aplicarModo(modo) {
  document.body.classList.toggle("light", modo === "light");
  localStorage.setItem("wrmThemeMode", modo);
  updateThemeIcon();
}
function toggleTheme() {
  document.body.classList.toggle("light");
  const mode = document.body.classList.contains("light") ? "light" : "dark";
  localStorage.setItem("wrmThemeMode", mode);
  updateThemeIcon();
  salvarPref({ modo: mode });
}
function updateThemeIcon() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  const isLight = document.body.classList.contains("light");
  btn.textContent = isLight ? "🌙" : "🌑";
  btn.title = isLight ? "Modo escuro" : "Modo claro";
}

function showToast(msg, type = "") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add("show"), 10);
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.classList.remove("show"); }, 2800);
}

async function salvarPref(patch) {
  Object.assign(PREFS, patch);
  if (!EU) return;
  const { error } = await sb.from("preferencias").update(patch).eq("user_id", EU.id);
  if (error) console.error("preferencias:", error.message);
}
async function atualizarPerfil(patch) {
  const { error } = await sb.from("profiles").update(patch).eq("id", EU.id);
  if (error) { console.error("profiles:", error.message); return false; }
  return true;
}

const PALETAS = [
  { id: "padrao", nome: "Névoa",    cores: ["#77858b", "#849fad", "#a9b9bd", "#cbc9cc", "#f0e5df"] },
  { id: "rosa",   nome: "Rosé",     cores: ["#8c4a5e", "#b0607a", "#dba8b8", "#e9d3da", "#f7ece6"] },
  { id: "verde",  nome: "Floresta", cores: ["#3f6652", "#4f7d62", "#8fb59e", "#c9dccf", "#eef0e0"] },
  { id: "roxo",   nome: "Lavanda",  cores: ["#46396b", "#7662a8", "#a99bd0", "#d8d0ea", "#f0e9f2"] },
  { id: "solar",  nome: "Areia",    cores: ["#7f5a0c", "#a07a1d", "#d4b25a", "#ecd9a3", "#f6efd9"] },
];
function renderPaletas() {
  const box = document.getElementById("listaPaletas");
  if (!box) return;
  box.innerHTML = PALETAS.map(p => `
    <button class="paleta-card" data-tema="${p.id}" onclick="trocarTema('${p.id}')">
      <span class="paleta-cores">${p.cores.map(c => `<i style="background:${c}"></i>`).join("")}</span>${p.nome}
    </button>`).join("");
}
function aplicarTema(tema) {
  if (tema === "amarelo") tema = "solar";
  if (!PALETAS.some(p => p.id === tema)) tema = "padrao";
  document.documentElement.dataset.tema = tema;
  localStorage.setItem("temaPerfil", tema);
  document.querySelectorAll(".paleta-card").forEach(b => b.classList.toggle("active", b.dataset.tema === tema));
}
function trocarTema(tema) { aplicarTema(tema); salvarPref({ tema: document.documentElement.dataset.tema }); showToast(" Paleta aplicada!", "success"); }

function aplicarFonte(t, avisar = false) {
  t = String(t);
  document.documentElement.style.zoom = Number(t) / 15;
  localStorage.setItem("wrmFonte", t);
  if (avisar) { salvarPref({ fonte: Number(t) }); showToast("Tamanho do texto ajustado!", "success"); }
}

/* ---------- imagens / storage ---------- */
function reduzirParaBlob(arquivo, larguraMax, qualidade = 0.85) {
  return new Promise((ok, erro) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const f = Math.min(1, larguraMax / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? ok(b) : erro(new Error("Falha ao processar a imagem.")), "image/jpeg", qualidade);
    };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error("Não foi possível ler essa imagem.")); };
    img.src = url;
  });
}
/* envia para <bucket>/<meu id>/<nome> e devolve a URL pública */
async function enviarImagem(bucket, nome, blob, upsert = true) {
  const path = `${EU.id}/${nome}`;
  const { error } = await sb.storage.from(bucket).upload(path, blob, { upsert, contentType: "image/jpeg", cacheControl: "3600" });
  if (error) throw error;
  return { path, url: sb.storage.from(bucket).getPublicUrl(path).data.publicUrl };
}
const urlImagemPost = path => sb.storage.from("posts").getPublicUrl(path).data.publicUrl;

/* ---------- bio ---------- */
function editarBio() {
  const bio = document.getElementById("bioTexto");
  const area = document.getElementById("bioTextarea");
  const btnEditar = document.getElementById("btnEditarBio");
  const btnSalvar = document.getElementById("btnSalvarBio");
  const btnCancelar = document.getElementById("btnCancelarBio");
  if (!bio || !area) return;
  bio.style.display = "none";
  area.style.display = "block";
  area.value = EU ? EU.bio : bio.textContent.trim();
  btnEditar.style.display = "none";
  if (btnSalvar) btnSalvar.style.display = "inline-flex";
  if (btnCancelar) btnCancelar.style.display = "inline-flex";
  area.focus();
}
async function salvarBio() {
  const bio = document.getElementById("bioTexto");
  const area = document.getElementById("bioTextarea");
  const btnEditar = document.getElementById("btnEditarBio");
  const btnSalvar = document.getElementById("btnSalvarBio");
  const btnCancelar = document.getElementById("btnCancelarBio");
  if (!bio || !area) return;
  const texto = area.value.trim().slice(0, 300);
  if (!(await atualizarPerfil({ bio: texto }))) { showToast("Não foi possível salvar a bio.", "error"); return; }
  EU.bio = texto;
  bio.textContent = texto || "Escreva sua bio...";
  bio.style.display = "block";
  area.style.display = "none";
  btnEditar.style.display = "inline-flex";
  if (btnSalvar) btnSalvar.style.display = "none";
  if (btnCancelar) btnCancelar.style.display = "none";
  showToast("Bio atualizada!", "success");
}
function cancelarBio() {
  const bio = document.getElementById("bioTexto");
  const area = document.getElementById("bioTextarea");
  const btnEditar = document.getElementById("btnEditarBio");
  const btnSalvar = document.getElementById("btnSalvarBio");
  const btnCancelar = document.getElementById("btnCancelarBio");
  if (!bio || !area) return;
  bio.style.display = "block";
  area.style.display = "none";
  btnEditar.style.display = "inline-flex";
  if (btnSalvar) btnSalvar.style.display = "none";
  if (btnCancelar) btnCancelar.style.display = "none";
}

function copiarLink() {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => showToast("Link copiado!", "success")).catch(() => showToast("Link: " + url));
}
function compartilharPerfil() {
  const dados = { title: "Loom — " + (document.getElementById("nomeUsuario")?.textContent || "perfil"), text: "Confira meu perfil no Loom!", url: window.location.href };
  if (navigator.share) navigator.share(dados).catch(() => copiarLink()); else copiarLink();
}

/* ---------- usuários / explorar ---------- */
async function buscarUsuarios() {
  const { data, error } = await sb.from("v_perfis").select("*").order("nome").limit(1000);
  if (error) { console.error(error.message); return []; }
  return data.map(norm);
}
async function buscarUsuario(handle) {
  const { data } = await sb.from("v_perfis").select("*").eq("username", slugUser(handle)).maybeSingle();
  return norm(data);
}
async function getSeguindoIds() {
  if (!EU) return new Set();
  const { data } = await sb.from("follows").select("seguido_id").eq("seguidor_id", EU.id);
  return new Set((data || []).map(r => r.seguido_id));
}
async function alternarSeguir(userId, seguir) {
  const q = seguir
    ? sb.from("follows").insert({ seguidor_id: EU.id, seguido_id: userId })
    : sb.from("follows").delete().match({ seguidor_id: EU.id, seguido_id: userId });
  const { error } = await q;
  if (error) console.error(error.message);
  return !error;
}

function filtrarAlunos() {
  const pesquisaInput = document.getElementById("pesquisa");
  const filtroTurmaInput = document.getElementById("filtroTurma");
  const filtroAnoInput = document.getElementById("filtroAno");
  const alunos = document.querySelectorAll(".aluno-card");
  if (!pesquisaInput || !filtroTurmaInput || !filtroAnoInput) return;
  const pesquisa = pesquisaInput.value.toLowerCase();
  const turma = filtroTurmaInput.value;
  const ano = filtroAnoInput.value;
  let visiveis = 0;
  alunos.forEach(aluno => {
    const ok = (aluno.dataset.nome.toLowerCase().includes(pesquisa) || aluno.dataset.user.includes(pesquisa))
      && (turma === "" || aluno.dataset.turma === turma)
      && (ano === "" || aluno.dataset.ano === ano);
    aluno.style.display = ok ? "block" : "none";
    if (ok) visiveis++;
  });
  const msg = document.getElementById("semResultados");
  if (msg) msg.style.display = visiveis === 0 ? "block" : "none";
}

async function initExplorar() {
  const lista = document.getElementById("listaAlunos");
  if (!lista) return;
  const [usuarios, seguindo] = await Promise.all([buscarUsuarios(), getSeguindoIds()]);
  lista.innerHTML = "";
  usuarios.forEach(u => {
    const on = estaOnline(u);
    const card = document.createElement("div");
    card.className = "aluno-card";
    card.dataset.id = u.id; card.dataset.user = u.user; card.dataset.nome = u.nome;
    card.dataset.turma = u.curso; card.dataset.ano = String(u.ano);
    const jaSegue = seguindo.has(u.id);
    card.innerHTML = `
      <img src="${esc(avatarUsuario(u))}" alt="${esc(u.nome)}">
      <h3>${esc(u.nome)}</h3>
      <p>${esc(turmaTexto(u))}</p>
      <span class="status-card ${on ? "online-texto" : "offline-texto"}">● ${on ? "Online" : "Offline"}</span>
      <div class="aluno-acoes">
        ${u.id === EU.id ? "" : `<button class="btn-seguir ${jaSegue ? "seguindo" : ""}" onclick="seguirAluno(this)">${jaSegue ? "Seguindo" : "+ Seguir"}</button>`}
        <a href="perfil.html?u=${encodeURIComponent(u.user)}" class="btn-ver-perfil">Ver perfil</a>
      </div>`;
    lista.appendChild(card);
  });
  filtrarAlunos();
}

async function seguirAluno(btn) {
  const card = btn.closest(".aluno-card");
  const quer = !btn.classList.contains("seguindo");
  btn.disabled = true;
  const ok = await alternarSeguir(card.dataset.id, quer);
  btn.disabled = false;
  if (!ok) { showToast("Não foi possível concluir.", "error"); return; }
  btn.classList.toggle("seguindo", quer);
  btn.textContent = quer ? "Seguindo" : "+ Seguir";
  const nome = card.querySelector("h3").textContent;
  showToast(quer ? `Você está seguindo ${nome}!` : `Você deixou de seguir ${nome}.`, quer ? "success" : "");
}

/* ---------- destaques ---------- */
async function renderDestaques(criterio = "views") {
  const grid = document.getElementById("destaquesGrid");
  if (!grid) return;
  document.querySelectorAll(".destaques-tabs button").forEach(b => b.classList.toggle("active", b.dataset.rank === criterio));
  const outro = criterio === "views" ? "seguidores" : "views";
  const { data, error } = await sb.from("v_perfis").select("*").eq("verificado", true)
    .order(criterio, { ascending: false, nullsFirst: false })
    .order(outro, { ascending: false, nullsFirst: false }).limit(3);
  if (error) { console.error(error.message); return; }
  if (!data.length) { grid.innerHTML = '<p style="color:var(--text-muted)">Ainda não há perfis verificados.</p>'; return; }
  const medalhas = ["🥇", "🥈", "🥉"];
  grid.innerHTML = data.map(norm).map((u, i) => `
    <a class="destaque-card" href="perfil.html?u=${encodeURIComponent(u.user)}">
      <span class="destaque-medalha">${medalhas[i]}</span>
      <img src="${esc(avatarUsuario(u))}" alt="${esc(u.nome)}">
      <h3>${esc(u.nome)}</h3>
      <span class="destaque-user">@${esc(u.user)}</span>
      <span class="destaque-turma">${esc(turmaTexto(u))}</span>
      <div class="destaque-stats">
        <span class="${criterio === "views" ? "em-foco" : ""}">👁 ${u.views ?? "—"}</span>
        <span class="${criterio === "seguidores" ? "em-foco" : ""}">👥 ${u.seguidores}</span>
      </div>
    </a>`).join("");
}

/* ---------- links do perfil ---------- */
const REDES = [["instagram", "", "Instagram"], ["github", "", "GitHub"], ["spotify", "", "Spotify"], ["tiktok", "", "TikTok"], ["youtube", "", "YouTube"], ["linkedin", "", "LinkedIn"]];
async function getLinks(userId) {
  const { data } = await sb.from("links").select("url").eq("user_id", userId).order("posicao");
  return (data || []).map(l => l.url);
}
async function setLinks(urls) {
  const { error } = await sb.rpc("salvar_links", { p_urls: urls });
  if (error) console.error(error.message);
  return !error;
}
function urlSegura(v) {
  v = (v || "").trim(); if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch { return ""; }
}
function infoLink(url) {
  let h = ""; try { h = new URL(url).hostname; } catch {}
  const r = REDES.find(x => h.includes(x[0]));
  return r ? { emoji: r[1], nome: r[2] } : { emoji: "🔗", nome: h.replace(/^www\./, "") || url };
}
/* desenha os links de um aluno em `el`; devolve quantos links existem */
async function renderLinksEm(el, userId, classe, seta) {
  const urls = await getLinks(userId);
  el.innerHTML = "";
  urls.forEach(url => {
    const i = infoLink(url), a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    if (classe) a.className = classe;
    a.innerHTML = `${i.emoji} ${esc(i.nome)}` + (seta ? ' <span class="link-arrow">→</span>' : "");
    el.appendChild(a);
  });
  return urls.length;
}

/* ---------- tela inicial ---------- */
async function initInicio() {
  const nomeEl = document.getElementById("heroNome");
  if (!nomeEl) return;
  nomeEl.textContent = EU.nome;
  document.getElementById("heroTurma").textContent = `@${EU.user} • ${turmaTexto(EU)}`;
  document.getElementById("heroFoto").src = avatarUsuario(EU);
  await Promise.all([renderLinksEm(document.getElementById("heroLinks"), EU.id, "", false), initAvisos()]);
}

const AVISO_BADGE = { urgente: ["badge-urgente", "⚠ Urgente"], evento: ["badge-evento", "Evento"], info: ["badge-info", "Info"], geral: ["badge-normal", "Geral"] };
const EVENTO_TIPO = { prova: "Prova", trabalho: "Trabalho", apresentacao: "Apresentação", evento: "Evento" };
async function initAvisos() {
  const gridA = document.querySelector(".avisos-grid");
  const gridE = document.querySelector(".eventos-grid");
  const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (gridA) {
    const { data } = await sb.from("avisos").select("*").or(`expira_em.is.null,expira_em.gte.${hoje}`)
      .order("created_at", { ascending: false }).limit(8);
    gridA.innerHTML = (data || []).map(a => {
      const [cls, rot] = AVISO_BADGE[a.tipo] || AVISO_BADGE.geral;
      return `<div class="aviso-card ${a.tipo !== "geral" ? esc(a.tipo) : ""}">
        <span class="aviso-badge ${cls}">${rot}</span>
        <div class="aviso-titulo">${esc(a.titulo)}</div>
        <div class="aviso-desc">${esc(a.descricao)}</div>
        ${a.data_texto ? `<div class="aviso-data">📅 ${esc(a.data_texto)}</div>` : ""}
      </div>`;
    }).join("") || '<p style="color:var(--text-muted)">Nenhum aviso no momento.</p>';
  }
  if (gridE) {
    const { data } = await sb.from("eventos").select("*").gte("data", hoje).order("data").limit(8);
    gridE.innerHTML = (data || []).map(e => `<div class="evento-card">
      <div class="evento-header">
        <span class="evento-tipo tipo-${esc(e.tipo)}">${EVENTO_TIPO[e.tipo] || "Evento"}</span>
        <span class="evento-data">${e.data.slice(8, 10)}/${e.data.slice(5, 7)}</span>
      </div>
      <div class="evento-body">
        <div class="evento-titulo">${esc(e.titulo)}</div>
        <div class="evento-desc">${esc(e.descricao)}</div>
      </div>
    </div>`).join("") || '<p style="color:var(--text-muted)">Nenhum evento próximo.</p>';
  }
}

/* ---------- feed ---------- */
const POST_SELECT = `id, autor_id, texto, imagem_path, created_at,
  autor:profiles!autor_id(id, username, nome, curso, ano, avatar_url),
  likes:post_likes(count),
  comentarios(id, texto, mencao, parent_id, created_at, autor:profiles!autor_id(username, nome))`;

function criarComentarioEl(autorNome, texto, mencao = "", id = "", autorUser = "") {
  const d = document.createElement("div");
  d.className = "comentario";
  d.dataset.autor = autorUser || autorNome;
  if (id) d.dataset.id = id;
  d.innerHTML = `<p><strong style="color:var(--accent)">${esc(autorNome)}</strong> ${mencao ? `<span class="mencao">@${esc(mencao)}</span> ` : ""}${esc(texto)}</p>
    <div class="comentario-acoes"><button onclick="responderComentario(this)">Responder</button></div>
    ${mencao ? "" : '<div class="respostas"></div>'}`;
  return d;
}

function montarPostEl(p, curtidos) {
  const a = norm({ ...p.autor, username: p.autor.username, avatar_url: p.autor.avatar_url });
  const el = document.createElement("div");
  el.className = "post-card";
  el.dataset.id = p.id; el.dataset.turma = a.curso; el.dataset.autor = a.user;
  const podeApagar = EU && (p.autor_id === EU.id || EU.is_admin);
  const nLikes = p.likes?.[0]?.count || 0;
  const curtido = curtidos.has(p.id);
  el.innerHTML = `
    <div class="post-topo-card">
      <div class="post-topo-info">
        <img src="${esc(avatarUsuario(a))}" alt="${esc(a.nome)}">
        <div><h3><a href="perfil.html?u=${encodeURIComponent(a.user)}" style="color:inherit;text-decoration:none">${esc(a.nome)}</a></h3><span>${esc(turmaTexto(a))}</span></div>
      </div>
      ${podeApagar ? '<button class="btn-excluir-post" onclick="excluirPost(this)" title="Excluir postagem">✕</button>' : ""}
    </div>
    ${p.texto ? `<p class="post-texto">${esc(p.texto)}</p>` : ""}
    ${p.imagem_path ? `<img src="${esc(urlImagemPost(p.imagem_path))}" alt="Imagem" class="post-imagem" loading="lazy">` : ""}
    <div class="post-acoes">
      <button onclick="curtirPost(this)" data-count="${nLikes}" data-curtido="${curtido ? 1 : 0}" ${curtido ? 'style="color:#f87171"' : ""}>❤ ${nLikes}</button>
      <button onclick="mostrarComentarios(this)">💬 Comentários</button>
    </div>
    <div class="comentarios" style="display:none;">
      <div class="lista-comentarios"></div>
      <div class="comentario-row">
        <input type="text" placeholder="Escreva um comentário..." class="input-comentario" maxlength="1000">
        <button class="btn-enviar-comentario" onclick="comentarPost(this)">Enviar</button>
      </div>
    </div>`;
  const lista = el.querySelector(".lista-comentarios");
  const todos = [...(p.comentarios || [])].sort((x, y) => x.created_at.localeCompare(y.created_at));
  todos.filter(c => !c.parent_id).forEach(c => {
    const ce = criarComentarioEl(c.autor.nome, c.texto, "", c.id, c.autor.username);
    todos.filter(r => r.parent_id === c.id).forEach(r =>
      ce.querySelector(".respostas").appendChild(criarComentarioEl(r.autor.nome, r.texto, r.mencao || "", r.id, r.autor.username)));
    lista.appendChild(ce);
  });
  return el;
}

async function carregarFeed() {
  const lista = document.getElementById("listaPostagens");
  if (!lista) return;
  lista.innerHTML = '<p style="color:var(--ap-muted)">Carregando...</p>';
  const [rPosts, rLikes] = await Promise.all([
    sb.from("posts").select(POST_SELECT).order("created_at", { ascending: false }).limit(50),
    sb.from("post_likes").select("post_id").eq("user_id", EU.id),
  ]);
  if (rPosts.error) { lista.innerHTML = '<p style="color:var(--ap-muted)">Não foi possível carregar o feed.</p>'; console.error(rPosts.error.message); return; }
  const curtidos = new Set((rLikes.data || []).map(l => l.post_id));
  lista.innerHTML = "";
  if (!rPosts.data.length) { lista.innerHTML = '<p style="color:var(--ap-muted)">Ninguém postou ainda. Seja o primeiro!</p>'; return; }
  rPosts.data.forEach(p => lista.appendChild(montarPostEl(p, curtidos)));
  aplicarFiltroFeed();
}

function atualizarCurtida(botao, curtido) {
  let n = parseInt(botao.dataset.count || 0);
  n = Math.max(0, n + (curtido ? 1 : -1));
  botao.dataset.curtido = curtido ? "1" : "0";
  botao.dataset.count = n;
  botao.style.color = curtido ? "#f87171" : "";
  botao.textContent = `❤ ${n}`;
}
async function curtirPost(botao) {
  const id = botao.closest(".post-card").dataset.id;
  const curtido = botao.dataset.curtido === "1";
  atualizarCurtida(botao, !curtido);                       // otimista
  const { error } = curtido
    ? await sb.from("post_likes").delete().match({ post_id: id, user_id: EU.id })
    : await sb.from("post_likes").insert({ post_id: id, user_id: EU.id });
  if (error) { atualizarCurtida(botao, curtido); showToast("Não foi possível curtir.", "error"); }
}

function mostrarComentarios(botao) {
  const comentarios = botao.parentElement.nextElementSibling;
  comentarios.style.display = comentarios.style.display !== "none" ? "none" : "block";
}
function responderComentario(btn) {
  const alvo = btn.closest(".comentario");
  const box = btn.closest(".comentarios");
  box._alvo = alvo;
  let aviso = box.querySelector(".respondendo");
  if (!aviso) { aviso = document.createElement("div"); aviso.className = "respondendo"; box.querySelector(".comentario-row").before(aviso); }
  aviso.innerHTML = `<span>Respondendo a <b>@${esc(alvo.dataset.autor)}</b></span><button onclick="cancelarResposta(this)">✕</button>`;
  box.querySelector(".input-comentario").focus();
}
function cancelarResposta(el) {
  const box = el.closest(".comentarios");
  box._alvo = null;
  box.querySelector(".respondendo")?.remove();
}
async function comentarPost(botao) {
  const box = botao.closest(".comentarios");
  const input = box.querySelector(".input-comentario");
  const texto = input.value.trim();
  if (!texto) return;
  if (!EU.verificado) { showToast("Verifique sua conta (menu → Verificar conta) para comentar.", "error"); return; }
  const postId = box.closest(".post-card").dataset.id;
  const alvo = box._alvo;
  const topo = alvo ? (alvo.closest(".respostas") ? alvo.parentElement.closest(".comentario") : alvo) : null;
  const mencao = alvo ? alvo.dataset.autor : null;
  botao.disabled = true;
  const { data, error } = await sb.from("comentarios")
    .insert({ post_id: postId, autor_id: EU.id, texto, parent_id: topo ? topo.dataset.id : null, mencao })
    .select("id").single();
  botao.disabled = false;
  if (error) { showToast("Não foi possível comentar.", "error"); console.error(error.message); return; }
  if (topo) {
    topo.querySelector(".respostas").appendChild(criarComentarioEl(EU.nome, texto, mencao, data.id, EU.user));
    cancelarResposta(box.querySelector(".respondendo") || box);
  } else {
    box.querySelector(".lista-comentarios").appendChild(criarComentarioEl(EU.nome, texto, "", data.id, EU.user));
  }
  input.value = "";
  input.focus();
}

async function criarPostagem() {
  const textoEl = document.getElementById("textoPostagem");
  const imagemInput = document.getElementById("imagemPostagem");
  const lista = document.getElementById("listaPostagens");
  const texto = textoEl.value.trim();
  const arq = imagemInput.files[0];
  if (!EU.verificado) { showToast("Verifique sua conta (menu → Verificar conta) para postar.", "error"); return; }
  if (!texto && !arq) { showToast("Escreva algo ou escolha uma imagem.", "error"); return; }
  if (arq && !arq.type.startsWith("image/")) { showToast("Escolha um arquivo de imagem.", "error"); return; }

  const btn = document.querySelector(".btn-publicar");
  btn.disabled = true;
  let path = null;
  try {
    if (arq) {
      const blob = await reduzirParaBlob(arq, 1600);
      path = (await enviarImagem("posts", `${novoId()}.jpg`, blob, false)).path;
    }
    const { data, error } = await sb.from("posts").insert({ autor_id: EU.id, texto, imagem_path: path }).select(POST_SELECT).single();
    if (error) throw error;
    if (lista.querySelector("p")) lista.innerHTML = "";
    lista.prepend(montarPostEl(data, new Set()));
    textoEl.value = ""; imagemInput.value = "";
    EU.posts++; const ap = document.getElementById("apPosts"); if (ap) ap.textContent = EU.posts;
    showToast("Postagem publicada!", "success");
  } catch (e) {
    console.error(e);
    if (path) sb.storage.from("posts").remove([path]);
    showToast("Não foi possível publicar. " + (e.message || ""), "error");
  } finally { btn.disabled = false; }
}
function limparPostagem() {
  const textoEl = document.getElementById("textoPostagem");
  const imagemInput = document.getElementById("imagemPostagem");
  if (textoEl) textoEl.value = "";
  if (imagemInput) imagemInput.value = "";
}
async function excluirPost(btn) {
  const card = btn.closest(".post-card");
  if (!card) return;
  const img = card.querySelector(".post-imagem");
  const { error } = await sb.from("posts").delete().eq("id", card.dataset.id);
  if (error) { showToast("Não foi possível excluir.", "error"); return; }
  if (img) {
    const m = img.getAttribute("src").split("/posts/")[1];
    if (m) sb.storage.from("posts").remove([decodeURIComponent(m.split("?")[0])]);
  }
  if (card.dataset.autor === EU.user) { EU.posts = Math.max(0, EU.posts - 1); const ap = document.getElementById("apPosts"); if (ap) ap.textContent = EU.posts; }
  card.style.opacity = "0"; card.style.transform = "scale(0.95)"; card.style.transition = "all 0.25s ease";
  setTimeout(() => card.remove(), 250);
  showToast("Postagem excluída.", "");
}

let cursoFeed = "";
function filtrarFeed(curso, btn) {
  cursoFeed = curso;
  document.querySelectorAll(".ap-turma").forEach(b => b.classList.toggle("active", b === btn));
  aplicarFiltroFeed();
}
function aplicarFiltroFeed() {
  const q = (document.getElementById("buscaFeed")?.value || "").toLowerCase();
  document.querySelectorAll("#listaPostagens .post-card").forEach(p => {
    const okTurma = !cursoFeed || p.dataset.turma === cursoFeed;
    const okBusca = !q || p.textContent.toLowerCase().includes(q);
    p.style.display = okTurma && okBusca ? "" : "none";
  });
}

/* ---------- autenticação ---------- */
function mensagemErroAuth(error) {
  const m = (error.message || "").toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("not confirmed")) return "Confirme seu e-mail (veja sua caixa de entrada) antes de entrar.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Esse e-mail já tem cadastro.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde um pouco.";
  if (m.includes("password")) return "Senha inválida (mínimo de 6 caracteres).";
  return "Algo deu errado: " + error.message;
}
async function fazerLogin() {
  const email = document.getElementById("email").value.trim().toLowerCase();
  const senha = document.getElementById("senha").value;
  if (!email || !senha) { showToast("Preencha todos os campos!", "error"); return; }
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) { showToast(mensagemErroAuth(error), "error"); return; }
  showToast("Login realizado!", "success");
  setTimeout(() => window.location.href = "inicio.html", 600);
}
async function esqueciSenha(e) {
  if (e) e.preventDefault();
  const email = document.getElementById("email")?.value.trim().toLowerCase();
  if (!email) { showToast("Digite seu e-mail no campo acima.", "error"); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: new URL("redefinir.html", location.href).href });
  if (error) { showToast(mensagemErroAuth(error), "error"); return; }
  showToast("Enviamos um link para redefinir a senha.", "success");
}
async function sairApp() {
  await sb.auth.signOut();
  window.location.href = "login.html";
}
const sairDaConta = sairApp;

async function validarUsuario(valor) {
  const user = slugUser(valor);
  if (!/^[a-z0-9._]{3,20}$/.test(user))
    return { ok: false, user, msg: "Use de 3 a 20 caracteres: letras, números, ponto ou _." };
  const { data, error } = await sb.rpc("username_disponivel", { p_username: user });
  if (error) return { ok: false, user, msg: "Não foi possível verificar o usuário agora." };
  return data ? { ok: true, user, msg: ` @${user} está disponível!` } : { ok: false, user, msg: "✕ Esse usuário já está em uso." };
}
async function garantirUsuario(e) {
  e.preventDefault();
  const r = await validarUsuario(document.getElementById("garantirUser").value);
  if (!r.ok) { showToast(r.msg, "error"); return; }
  window.location.href = "cadastro.html?user=" + encodeURIComponent(r.user);
}

async function fazerCadastro(e) {
  if (e) e.preventDefault();
  const campos = ["nomeCadastro", "usuarioCadastro", "emailCadastro", "turmaCadastro", "senhaCadastro"];
  let vazio = false;
  campos.forEach(id => {
    const el = document.getElementById(id);
    const falta = !el.value.trim();
    el.classList.toggle("campo-erro", falta);
    if (falta) vazio = true;
  });
  if (vazio) { showToast("Preencha todos os campos!", "error"); return; }

  const nome = document.getElementById("nomeCadastro").value.trim();
  const email = document.getElementById("emailCadastro").value.trim().toLowerCase();
  const turma = document.getElementById("turmaCadastro").value;
  const senha = document.getElementById("senhaCadastro").value;

  if (nome.length < 2) { showToast("Digite seu nome.", "error"); return; }
  const r = await validarUsuario(document.getElementById("usuarioCadastro").value);
  if (!r.ok) { showToast(r.msg, "error"); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("E-mail inválido.", "error"); return; }
  if (senha.length < 6) { showToast("A senha precisa de ao menos 6 caracteres.", "error"); return; }

  const [curso, ano] = turma.split("-");
  const btn = document.querySelector("#formCadastro button[type=submit]");
  btn.disabled = true;
  const { data, error } = await sb.auth.signUp({
    email, password: senha,
    options: { data: { username: r.user, nome, curso, ano: Number(ano) }, emailRedirectTo: new URL("login.html", location.href).href },
  });
  btn.disabled = false;
  if (error) { showToast(mensagemErroAuth(error), "error"); return; }
  /* e-mail já cadastrado: o Supabase devolve um usuário "falso" sem identidades */
  if (data.user && data.user.identities && data.user.identities.length === 0) { showToast("Esse e-mail já tem cadastro.", "error"); return; }
  if (!data.session) {
    showToast("Conta criada! Confirme seu e-mail e depois faça login.", "success");
    setTimeout(() => window.location.href = "login.html", 1800);
    return;
  }
  showToast("Cadastro realizado! Agora digite o código de verificação.", "success");
  setTimeout(() => window.location.href = "verificar.html", 1200);
}

let _seqUser = 0, _tUser = null;
function initCadastro() {
  const inp = document.getElementById("usuarioCadastro");
  if (!inp) return;
  const msg = document.getElementById("msgUsuario");
  const checar = () => {
    inp.value = slugUser(inp.value);
    clearTimeout(_tUser);
    if (!inp.value) { msg.textContent = ""; return; }
    _tUser = setTimeout(async () => {
      const seq = ++_seqUser;
      const r = await validarUsuario(inp.value);
      if (seq !== _seqUser) return;
      msg.textContent = r.msg;
      msg.className = "msg-campo " + (r.ok ? "ok" : "erro");
    }, 350);
  };
  inp.addEventListener("input", checar);
  const pre = new URLSearchParams(location.search).get("user");
  if (pre) { inp.value = pre; checar(); }
  document.querySelectorAll("#formCadastro input, #formCadastro select")
    .forEach(el => el.addEventListener("input", () => el.classList.remove("campo-erro")));
}

/* ---------- verificação de conta ---------- */
async function confirmarCodigoServidor(codigo) {
  const { data, error } = await sb.rpc("confirmar_codigo", { p_codigo: codigo });
  if (error) return "erro";
  return data;
}

/* ---------- shell do app (sidebar) ---------- */
function initApp() {
  if (!document.getElementById("apNome") || !EU) return;
  const txt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const foto = avatarUsuario(EU);
  ["apFoto", "apFoto2"].forEach(id => { const el = document.getElementById(id); if (el) el.src = foto; });
  txt("apNome", EU.nome); txt("apNome2", EU.nome);
  txt("apUser", "@" + EU.user);
  txt("apTurma", turmaTexto(EU)); txt("apTurma2", turmaTexto(EU));
  txt("apViews", EU.views ?? 0); txt("apSeg", EU.seguidores); txt("apPosts", EU.posts);
}

function montarShell() {
  const body = document.body;
  if (!body.classList.contains("app-body") || !EU) return;
  const pag = location.pathname.split("/").pop() || "index.html";
  const itens = [
    ...(!EU.verificado ? [["verificar.html", "", "Verificar conta"]] : []),
    ["feed.html", "", "Feed"], ["inicio.html", "", "Início"], ["explorar.html", "", "Explorar"],
    ["perfil.html", "", "Meu perfil"], ["configuracoes.html", "", "Configurações"],
    ...(EU.is_admin ? [["admin.html", "", "🛡 Administração"]] : []),
  ];
  const app = document.createElement("div");
  app.className = "app";
  app.innerHTML = `
    <aside class="ap-side">
      <a href="index.html" class="ap-logo"><b>L</b>Loom</a>
      <div class="ap-me">
        <img id="apFoto" src="" alt="Minha foto">
        <h3 id="apNome"></h3>
        <div class="ap-user" id="apUser"></div>
        <span class="ap-chip" id="apTurma"></span>
      </div>
      <div class="ap-stats">
        <div><strong id="apViews">0</strong><span>Visitas</span></div>
        <div><strong id="apSeg">0</strong><span>Seguidores</span></div>
        <div><strong id="apPosts">0</strong><span>Posts</span></div>
      </div>
      <nav class="ap-nav">
        ${itens.map(([h, i, t]) => `<a href="${h}" class="${pag === h ? "active" : ""}">${i} ${t}</a>`).join("")}
        <button class="sep" id="themeToggle" onclick="toggleTheme()">🌑</button>
        <button onclick="sairApp()">↩ Sair</button>
      </nav>
    </aside>
    <main class="ap-main"></main>`;
  const main = app.querySelector(".ap-main");
  [...body.children].filter(el => el.tagName !== "SCRIPT" && el.id !== "toast").forEach(el => main.appendChild(el));
  body.insertBefore(app, body.firstChild);
  body.classList.add("pronto");
}

function initNavPill() {
  const menu = document.querySelector(".menu");
  if (!menu) return;
  const pill = document.createElement("div");
  pill.style.cssText = `position:absolute;background:rgba(255,255,255,0.18);backdrop-filter:blur(8px);border-radius:999px;transition:all .3s cubic-bezier(.4,0,.2,1);pointer-events:none;z-index:0;`;
  menu.appendChild(pill);
  function moverPill(el) {
    pill.style.width = el.offsetWidth + "px"; pill.style.height = el.offsetHeight + "px";
    pill.style.left = el.offsetLeft + "px"; pill.style.top = el.offsetTop + "px";
  }
  const ativo = menu.querySelector("a.active");
  if (ativo) moverPill(ativo);
  menu.querySelectorAll("a").forEach(link => {
    link.addEventListener("mouseenter", () => moverPill(link));
    link.addEventListener("mouseleave", () => {
      const atual = menu.querySelector("a.active");
      if (atual) moverPill(atual); else pill.style.width = "0";
    });
  });
}

/* ---------- sessão e inicialização ---------- */
async function carregarEU() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { EU = null; PREFS = {}; return; }
  const [rPerfil, rPrefs] = await Promise.all([
    sb.from("v_perfis").select("*").eq("id", session.user.id).maybeSingle(),
    sb.from("preferencias").select("*").eq("user_id", session.user.id).maybeSingle(),
  ]);
  if (!rPerfil.data) { await sb.auth.signOut(); EU = null; PREFS = {}; return; }
  EU = { ...norm(rPerfil.data), email: session.user.email };
  PREFS = rPrefs.data || {};
}
function heartbeat() {
  if (EU) sb.from("profiles").update({ ultimo_acesso: new Date().toISOString() }).eq("id", EU.id).then(() => {});
}

async function boot() {
  initTheme();
  const ehApp = document.body.classList.contains("app-body");
  try { await carregarEU(); } catch (e) { console.error(e); }
  if (ehApp && !EU) { location.replace("login.html"); return; }
  if (EU && document.body.hasAttribute("data-guest-only")) { location.replace("inicio.html"); return; }

  if (EU) {
    if (PREFS.modo) aplicarModo(PREFS.modo);
    if (PREFS.tema) localStorage.setItem("temaPerfil", PREFS.tema);
    if (PREFS.fonte) localStorage.setItem("wrmFonte", String(PREFS.fonte));
    heartbeat(); setInterval(heartbeat, 120000);
  }
  montarShell();
  updateThemeIcon();
  renderPaletas();
  aplicarTema(localStorage.getItem("temaPerfil") || "padrao");
  aplicarFonte(localStorage.getItem("wrmFonte") || "15");
  initNavPill();
  initCadastro();
  initApp();

  await Promise.all([initInicio(), renderDestaques("views"), initExplorar(), carregarFeed()]
    .map(p => p.catch(e => console.error(e))));

  /* Enter envia o comentário (funciona também em comentários criados depois) */
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.classList?.contains("input-comentario")) e.target.nextElementSibling?.click();
  });
  window.__loomResolve();
}
document.addEventListener("DOMContentLoaded", boot);

/* imagem quebrada -> avatar com a inicial */
document.addEventListener("error", e => {
  const img = e.target;
  if (!img || img.tagName !== "IMG" || img.dataset.fb || img.classList.contains("post-imagem")) return;
  img.dataset.fb = "1";
  img.src = avatarUsuario({ nome: img.alt || "?" });
}, true);
