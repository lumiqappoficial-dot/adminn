/* =====================================================================
   LUMIQ ADMIN - lumiqadmin.js (JavaScript puro, sin TypeScript)
   Requiere en el HTML: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   ===================================================================== */

// ---------------- CONFIGURACION ----------------
// Si los dejas vacios, se leen de /api/supabase-config (backend de este proyecto).
// Si usas estos 2 archivos en otro servidor, pega aqui tu URL y anon key.
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";

const CORREO_ADMIN = "limberhuaychoquispe81@gmail.com";
const REDIRECT_URL = window.location.origin + "/lumiqadmin.html";
const MINUTOS_VIGENCIA = 10; // igual que verificar_codigo()
const mensajeWhatsApp = (codigo, nombre) =>
  `Hola${nombre ? " " + nombre : ""}, tu código de verificación de Lumiq es: ${codigo}. Vence en ${MINUTOS_VIGENCIA} minutos. No lo compartas con nadie.`;

// ---------------- ESTADO ----------------
let sb = null;
let usuarioAuth = null; // auth.users
let perfil = null;      // obtener_mi_usuario()
let esAdmin = false;
let roles = [];
let vistaActual = null;
let timerCodigos = null;
const filtros = {};     // texto de busqueda por vista

// ---------------- UTILIDADES ----------------
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtFecha = (v) => (v ? new Date(v).toLocaleString("es", { dateStyle: "short", timeStyle: "short" }) : "—");
const aLocalInput = (v) => {
  if (!v) return "";
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const soloDigitos = (n) => String(n || "").replace(/\D/g, "");
const linkWhatsApp = (numero, texto) => `https://wa.me/${soloDigitos(numero)}?text=${encodeURIComponent(texto)}`;

function toast(msg, tipo = "ok") {
  const el = document.createElement("div");
  el.className = "toast " + tipo;
  el.setAttribute("data-testid", "toast");
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

async function copiar(texto, msg = "Copiado") {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const t = document.createElement("textarea");
    t.value = texto; document.body.appendChild(t); t.select();
    document.execCommand("copy"); t.remove();
  }
  toast(msg);
}

function mostrar(id) {
  ["#screen-login", "#screen-loading", "#screen-register", "#screen-app"].forEach((s) => $(s).classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function cargando(titulo = "Iniciando…", sub = "") {
  $("#loading-title").textContent = titulo;
  $("#loading-sub").textContent = sub;
  mostrar("#screen-loading");
}

function errorLogin(msg) {
  const el = $("#login-error");
  el.textContent = msg;
  el.classList.toggle("hidden", !msg);
  mostrar("#screen-login");
}

function generarCodigo() {
  // Mismas reglas que public.generar_codigo()
  const prohibidos = ["123456","654321","111111","222222","333333","444444","555555","666666","777777","888888","999999","000000","112233","121212","123123","456456","987654","012345","543210"];
  for (;;) {
    const c = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
    if (!prohibidos.includes(c) && !/^(\d)\1{5}$/.test(c) && !/^(012|123|234|345|456|567|678|789)/.test(c)) return c;
  }
}

// ---------------- ARRANQUE ----------------
async function obtenerConfig() {
  const origen = (u) => (String(u).match(/https?:\/\/[^/\s]+/) || [""])[0];
  if (SUPABASE_URL && SUPABASE_ANON_KEY) return { url: origen(SUPABASE_URL), anon_key: SUPABASE_ANON_KEY.trim() };
  const r = await fetch("/api/supabase-config");
  if (!r.ok) throw new Error("Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY.");
  return r.json();
}

async function iniciar() {
  cargando("Iniciando…", "Conectando con Supabase");
  try {
    if (!window.supabase) throw new Error("No se pudo cargar la librería de Supabase (CDN).");
    const cfg = await obtenerConfig();
    sb = window.supabase.createClient(cfg.url, cfg.anon_key, {
      auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    });
    try { $("#sb-host").textContent = new URL(cfg.url).host; } catch { /* nada */ }

    // Error devuelto por Google/Supabase en la URL
    const qs = new URLSearchParams(window.location.search + "&" + window.location.hash.slice(1));
    const errUrl = qs.get("error_description");

    const { data, error } = await sb.auth.getSession();
    if (window.location.search || window.location.hash) history.replaceState(null, "", window.location.pathname);
    if (error) throw error;
    if (errUrl) return errorLogin(errUrl);
    if (!data.session) return mostrar("#screen-login");
    await entrar(data.session.user);
  } catch (e) {
    errorLogin(e.message || String(e));
  }
}

async function loginGoogle() {
  cargando("Iniciando con Google…", "Te estamos redirigiendo");
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: REDIRECT_URL, queryParams: { prompt: "select_account" } },
  });
  if (error) errorLogin(error.message);
}

async function cerrarSesion() {
  clearInterval(timerCodigos);
  await sb.auth.signOut();
  usuarioAuth = null; perfil = null; esAdmin = false;
  errorLogin("");
}

// Verifica si tiene cuenta: si existe entra, si no muestra registro
async function entrar(user) {
  usuarioAuth = user;
  cargando("Iniciando…", "Verificando tu cuenta");
  const { data, error } = await sb.rpc("obtener_mi_usuario");
  if (error) return errorLogin("Error al verificar la cuenta: " + error.message);
  if (data?.resultado === "no_encontrado") return mostrarRegistro();
  if (data?.resultado !== "ok") return errorLogin("No se pudo obtener tu cuenta (" + (data?.resultado || "desconocido") + ")");
  perfil = data;
  const adm = await sb.rpc("es_admin");
  esAdmin = adm.data === true;
  if (esAdmin) {
    const r = await sb.from("roles").select("id,nombre_rol").order("id");
    roles = r.data || [];
  }
  mostrarPanel();
}

// ---------------- REGISTRO ----------------
function mostrarRegistro() {
  const meta = usuarioAuth.user_metadata || {};
  const correo = (usuarioAuth.email || "").toLowerCase();
  const adminCorreo = correo === CORREO_ADMIN;
  const f = $("#form-register");
  $("#reg-email").textContent = correo;
  $("#reg-admin-tag").classList.toggle("hidden", !adminCorreo);
  document.querySelectorAll("#form-register .req.adm").forEach((s) => s.classList.toggle("hidden", !adminCorreo));
  const nombreCompleto = (meta.full_name || meta.name || "").trim().split(/\s+/);
  if (!f.nombre.value) f.nombre.value = meta.given_name || nombreCompleto[0] || "";
  if (!f.apellido.value) f.apellido.value = meta.family_name || nombreCompleto.slice(1).join(" ");
  if (!f.foto_perfil.value) f.foto_perfil.value = (meta.avatar_url || meta.picture || "").slice(0, 255);
  $("#reg-error").classList.add("hidden");
  mostrar("#screen-register");
}

const MENSAJES_REGISTRO = {
  no_autenticado: "Tu sesión expiró. Vuelve a iniciar con Google.",
  datos_invalidos: "Nombre y número son obligatorios. El número debe tener de 7 a 15 dígitos (puede empezar con +).",
  datos_admin_incompletos: "Como administrador debes completar todos los campos.",
  sin_correo: "Tu cuenta de Google no tiene correo.",
  rol_no_encontrado: "No existe el rol en la tabla roles.",
  correo_duplicado: "Ese correo ya está registrado en usuarios.",
};

async function enviarRegistro(ev) {
  ev.preventDefault();
  const f = ev.target;
  const v = Object.fromEntries(new FormData(f).entries());
  Object.keys(v).forEach((k) => (v[k] = String(v[k]).trim()));
  const adminCorreo = (usuarioAuth.email || "").toLowerCase() === CORREO_ADMIN;
  const err = (m) => { const e = $("#reg-error"); e.textContent = m; e.classList.remove("hidden"); };

  if (!v.nombre || !v.numero) return err(MENSAJES_REGISTRO.datos_invalidos);
  if (!/^\+?[0-9]{7,15}$/.test(v.numero)) return err(MENSAJES_REGISTRO.datos_invalidos);
  if (adminCorreo && (!v.apellido || !v.fecha_nacimiento || !v.genero || !v.ubicacion || !v.foto_perfil)) return err(MENSAJES_REGISTRO.datos_admin_incompletos);

  const btn = $("#btn-reg-submit");
  btn.disabled = true; btn.textContent = "Creando…";
  const { data, error } = await sb.rpc("crear_mi_usuario", {
    p_nombre: v.nombre,
    p_numero: v.numero,
    p_apellido: v.apellido || null,
    p_fecha_nacimiento: v.fecha_nacimiento || null,
    p_genero: v.genero || null,
    p_ubicacion: v.ubicacion || null,
    p_foto_perfil: v.foto_perfil || null,
  });
  btn.disabled = false; btn.textContent = "Crear cuenta e ingresar";
  if (error) return err("Error: " + error.message);
  const res = data?.resultado;
  if (res === "creado" || res === "ya_existe") {
    toast(res === "creado" ? "Cuenta creada (" + data.rol + ")" : "Ya tenías cuenta");
    return entrar(usuarioAuth);
  }
  err(MENSAJES_REGISTRO[res] || "Respuesta: " + res);
}

// ---------------- PANEL ----------------
const VISTAS_ADMIN = [
  { id: "resumen", ico: "◆", label: "Resumen" },
  { id: "codigos", ico: "#", label: "Códigos 6 dígitos" },
  { sep: "Tablas" },
  { id: "usuarios", ico: "◉", label: "Usuarios" },
  { id: "roles", ico: "★", label: "Roles" },
  { id: "numero", ico: "☎", label: "Números" },
  { id: "celular", ico: "▣", label: "Celulares" },
  { id: "dispositivos", ico: "⇄", label: "Dispositivos" },
];
const VISTAS_USUARIO = [
  { id: "perfil", ico: "◉", label: "Mi perfil" },
  { id: "mis_numeros", ico: "☎", label: "Mis números" },
  { id: "mis_dispositivos", ico: "⇄", label: "Mis dispositivos" },
];

function mostrarPanel() {
  const nombre = [perfil.nombre, perfil.apellido].filter(Boolean).join(" ");
  $("#who-name").textContent = nombre;
  $("#who-mail").textContent = perfil.correo;
  $("#who-role").textContent = perfil.rol;
  const foto = perfil.foto_perfil || usuarioAuth.user_metadata?.avatar_url;
  $("#who-avatar").innerHTML = foto ? `<img class="avatar" src="${esc(foto)}" alt="" referrerpolicy="no-referrer" />` : esc((perfil.nombre || "?")[0].toUpperCase());

  const vistas = esAdmin ? VISTAS_ADMIN : VISTAS_USUARIO;
  $("#nav").innerHTML = vistas.map((v) => v.sep
    ? `<div class="nav-label">${esc(v.sep)}</div>`
    : `<button data-vista="${v.id}" data-testid="tab-${v.id}"><span class="ico">${v.ico}</span>${esc(v.label)}</button>`).join("");
  mostrar("#screen-app");
  irA(esAdmin ? "resumen" : "perfil");
}

function irA(vista) {
  vistaActual = vista;
  clearInterval(timerCodigos);
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.vista === vista));
  const fn = {
    resumen: vistaResumen, codigos: vistaCodigos,
    perfil: vistaPerfil, mis_numeros: () => vistaTabla("numero", true), mis_dispositivos: () => vistaTabla("dispositivos", true),
  }[vista];
  (fn || (() => vistaTabla(vista, false)))();
}

function cabecera(titulo, desc, acciones = "") {
  return `<div class="page-head"><div><h1 data-testid="page-title">${esc(titulo)}</h1><p>${desc}</p></div><div class="toolbar">${acciones}</div></div>`;
}

// ---------------- RESUMEN ----------------
async function vistaResumen() {
  const c = $("#content");
  c.innerHTML = cabecera("Resumen", "Totales de tu base de datos Supabase.") + `<div class="stats" id="stats"></div>`;
  const tablas = ["numero", "usuarios", "dispositivos", "celular", "roles"];
  const etiquetas = { numero: "Códigos generados", usuarios: "Usuarios", dispositivos: "Dispositivos", celular: "Celulares", roles: "Roles" };
  const res = await Promise.all(tablas.map((t) => sb.from(t).select(t === "numero" ? "id_numero" : "*", { count: "exact", head: true })));
  if (vistaActual !== "resumen") return;
  $("#stats").innerHTML = tablas.map((t, i) => `
    <div class="stat ${i === 0 ? "big" : ""}" data-ir="${t === "numero" ? "codigos" : t}" data-testid="stat-${t}">
      <div class="k">${etiquetas[t]}</div><div class="v">${res[i].error ? "—" : res[i].count ?? 0}</div>
    </div>`).join("");
}

// ---------------- CODIGOS DE 6 DIGITOS ----------------
let filtroEstado = "todos";

function estadoCodigo(n) {
  if (n.estado === "usado") return { k: "usado", t: "Usado", c: "pill-mute" };
  if (n.intento >= n.max_intento) return { k: "bloqueado", t: "Bloqueado", c: "pill-bad" };
  const vence = new Date(n.fecha_creado).getTime() + MINUTOS_VIGENCIA * 60000;
  if (Date.now() >= vence) return { k: "caducado", t: "Caducado", c: "pill-warn" };
  return { k: "activo", t: `Activo · ${Math.ceil((vence - Date.now()) / 60000)} min`, c: "pill-ok" };
}

async function vistaCodigos() {
  const c = $("#content");
  c.innerHTML = cabecera("Códigos de 6 dígitos",
    "Todos los códigos generados, listos para copiar o enviar por WhatsApp. Se actualiza cada 30 s.",
    `<input class="input" id="buscar-codigos" placeholder="Buscar número, nombre, código…" value="${esc(filtros.codigos || "")}" data-testid="code-search-input" />
     <button class="btn" id="btn-refrescar-codigos" data-testid="refresh-codes-btn">Actualizar</button>`) +
    `<div class="chips" id="chips-codigos">${["todos", "activo", "usado", "caducado", "bloqueado"].map((k) =>
      `<button class="chip ${filtroEstado === k ? "active" : ""}" data-estado="${k}" data-testid="code-filter-${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div>
    <div id="lista-codigos" class="codes"><div class="empty">Cargando códigos…</div></div>`;
  await cargarCodigos();
  timerCodigos = setInterval(() => vistaActual === "codigos" && cargarCodigos(), 30000);
}

let cacheCodigos = [];
async function cargarCodigos() {
  const [nums, usrs] = await Promise.all([
    sb.from("numero").select("id_numero,auth_usuario,numero,intento,max_intento,estado,fecha_creado").order("fecha_creado", { ascending: false }).limit(1000),
    sb.from("usuarios").select("auth_usuario,nombre,apellido,correo").limit(5000),
  ]);
  if (nums.error) { $("#lista-codigos").innerHTML = `<div class="empty">Error: ${esc(nums.error.message)}</div>`; return; }
  const porAuth = Object.fromEntries((usrs.data || []).map((u) => [u.auth_usuario, u]));
  // La columna "codigo" no se puede leer por la API: se pide con admin_ver_codigo()
  const codigos = await Promise.all(nums.data.map((n) => sb.rpc("admin_ver_codigo", { p_id_numero: n.id_numero })));
  cacheCodigos = nums.data.map((n, i) => ({ ...n, codigo: codigos[i].data || "", dueno: porAuth[n.auth_usuario] || null }));
  if (vistaActual === "codigos") pintarCodigos();
}

function pintarCodigos() {
  const q = (filtros.codigos || "").toLowerCase();
  const lista = cacheCodigos.filter((n) => {
    const est = estadoCodigo(n);
    if (filtroEstado !== "todos" && est.k !== filtroEstado) return false;
    if (!q) return true;
    const d = n.dueno || {};
    return [n.numero, n.codigo, d.nombre, d.apellido, d.correo, n.id_numero].join(" ").toLowerCase().includes(q);
  });
  const el = $("#lista-codigos");
  if (!lista.length) { el.innerHTML = `<div class="empty" data-testid="codes-empty">No hay códigos para mostrar.</div>`; return; }
  el.innerHTML = lista.map((n) => {
    const est = estadoCodigo(n);
    const d = n.dueno;
    const valido = /^\d{6}$/.test(n.codigo);
    const nombre = d ? [d.nombre, d.apellido].filter(Boolean).join(" ") : "";
    const msg = mensajeWhatsApp(n.codigo, d?.nombre);
    return `
    <article class="code-card ${est.k === "usado" ? "used" : ""}" data-testid="code-card" data-id="${n.id_numero}">
      <div class="code-top">
        <div class="code-digits" data-testid="code-value-${n.id_numero}">${valido ? n.codigo.split("").map((x) => `<span>${x}</span>`).join("") : `<span style="width:auto;padding:0 12px;font-size:13px">${esc(n.codigo || "sin acceso")}</span>`}</div>
        <span class="pill ${est.c}" data-testid="code-status-${n.id_numero}">${est.t}</span>
      </div>
      <dl class="code-meta">
        <dt>Número</dt><dd class="mono" data-testid="code-number-${n.id_numero}">${esc(n.numero)}</dd>
        <dt>Dueño</dt><dd>${d ? esc(nombre) + ` <span style="color:var(--muted)">· ${esc(d.correo)}</span>` : `<span style="color:var(--muted)">sin perfil</span>`}</dd>
        <dt>Intentos</dt><dd>${n.intento ?? 0} / ${n.max_intento}</dd>
        <dt>Creado</dt><dd>${fmtFecha(n.fecha_creado)}</dd>
        <dt>ID</dt><dd class="mono">#${n.id_numero}</dd>
      </dl>
      <div class="code-actions">
        <button class="btn btn-sm btn-primary" data-copiar="${esc(n.codigo)}" data-msg="Código copiado" ${valido ? "" : "disabled"} data-testid="copy-code-btn">Copiar código</button>
        <button class="btn btn-sm" data-copiar="${esc(msg)}" data-msg="Mensaje copiado" ${valido ? "" : "disabled"} data-testid="copy-message-btn">Copiar mensaje</button>
      </div>
      <div class="code-actions">
        <a class="btn btn-sm btn-wa" href="${esc(linkWhatsApp(n.numero, msg))}" target="_blank" rel="noopener" data-testid="whatsapp-link-btn">Enviar por WhatsApp</a>
        <button class="btn btn-sm" data-copiar="${esc(linkWhatsApp(n.numero, msg))}" data-msg="Link de WhatsApp copiado" data-testid="copy-whatsapp-link-btn">Copiar link wa.me</button>
      </div>
    </article>`;
  }).join("");
}

// ---------------- DEFINICION DE TABLAS ----------------
// t: text | number | date | datetime | uuid | email | select | rol ; ro = solo lectura ; crear = solo al crear
const TABLAS = {
  usuarios: {
    titulo: "Usuarios", pk: "id_usuario", orden: "id_usuario", select: "*",
    campos: [
      { k: "id_usuario", l: "ID", ro: true },
      { k: "id_rol", l: "Rol", t: "rol", req: true },
      { k: "nombre", l: "Nombre", req: true },
      { k: "apellido", l: "Apellido", req: true },
      { k: "correo", l: "Correo", t: "email", req: true },
      { k: "numero", l: "Número" },
      { k: "fecha_nacimiento", l: "Nacimiento", t: "date" },
      { k: "genero", l: "Género", t: "select", ops: ["", "Masculino", "Femenino", "Otro"] },
      { k: "ubicacion", l: "Ubicación" },
      { k: "foto_perfil", l: "Foto perfil (URL)" },
      { k: "seguidores", l: "Seguidores", t: "number" },
      { k: "calificacion", l: "Calificación", t: "number" },
      { k: "compras", l: "Compras", t: "number" },
      { k: "chats", l: "Chats", t: "number" },
      { k: "auth_usuario", l: "Auth UUID", t: "uuid" },
      { k: "fecha_creado", l: "Creado", t: "datetime", ro: true },
    ],
  },
  roles: {
    titulo: "Roles", pk: "id", orden: "id", select: "*",
    campos: [{ k: "id", l: "ID", ro: true }, { k: "nombre_rol", l: "Nombre del rol", req: true }],
  },
  numero: {
    titulo: "Números", pk: "id_numero", orden: "id_numero",
    select: "id_numero,auth_usuario,numero,intento,max_intento,estado,fecha_creado",
    campos: [
      { k: "id_numero", l: "ID", ro: true },
      { k: "numero", l: "Número", req: true },
      { k: "codigo", l: "Código (6 dígitos)", soloForm: true, hint: "Vacío = se genera al crear / no cambia al editar" },
      { k: "estado", l: "Estado", t: "select", ops: ["no usado", "usado"], req: true },
      { k: "intento", l: "Intentos", t: "number" },
      { k: "max_intento", l: "Máx. intentos", t: "number", req: true },
      { k: "auth_usuario", l: "Auth UUID", t: "uuid" },
      { k: "fecha_creado", l: "Creado", t: "datetime" },
    ],
  },
  celular: {
    titulo: "Celulares", pk: "id_celular", orden: "id_celular", select: "*",
    campos: [
      { k: "id_celular", l: "ID", ro: true },
      { k: "id_instalacion", l: "ID instalación", t: "uuid" },
      { k: "fabricante", l: "Fabricante" }, { k: "marca", l: "Marca" }, { k: "modelo", l: "Modelo" },
      { k: "version_android", l: "Android" }, { k: "sdk_android", l: "SDK", t: "number" },
      { k: "idioma", l: "Idioma" }, { k: "pais_configurado", l: "País" }, { k: "zona_horaria", l: "Zona horaria" },
      { k: "resolucion_pantalla", l: "Resolución" }, { k: "densidad_pantalla", l: "Densidad" },
    ],
  },
  dispositivos: {
    titulo: "Dispositivos", pk: "id_dispositivo", orden: "id_dispositivo", select: "*",
    campos: [
      { k: "id_dispositivo", l: "ID", ro: true },
      { k: "auth_usuario", l: "Auth UUID", t: "uuid" },
      { k: "id_numero", l: "ID número", t: "number" },
      { k: "id_celular", l: "ID celular", t: "number" },
      { k: "reenviar", l: "Reenvíos", t: "number", req: true },
      { k: "reenviar_max", l: "Máx. reenvíos", t: "number", req: true },
      { k: "tiempo_para_reenviar", l: "Puede reenviar desde", t: "datetime", req: true },
    ],
  },
};

let datosTabla = [];

function celda(c, v) {
  if (v === null || v === undefined || v === "") return `<span style="color:#475569">—</span>`;
  if (c.t === "datetime") return fmtFecha(v);
  if (c.t === "rol") return esc(roles.find((r) => r.id === v)?.nombre_rol || v);
  if (c.k === "estado") return `<span class="pill ${v === "usado" ? "pill-mute" : "pill-ok"}">${esc(v)}</span>`;
  if (c.t === "uuid") return `<span class="mono" title="${esc(v)}">${esc(String(v).slice(0, 8))}…</span>`;
  return esc(v);
}

async function vistaTabla(nombre, soloLectura) {
  const cfg = TABLAS[nombre];
  const titulo = soloLectura ? (nombre === "numero" ? "Mis números" : "Mis dispositivos") : cfg.titulo;
  const clave = vistaActual;
  $("#content").innerHTML = cabecera(titulo,
    soloLectura ? "Solo lectura: ves únicamente tus registros." : `Administra la tabla <span class="mono">public.${nombre}</span>.`,
    `<input class="input" id="buscar-tabla" placeholder="Buscar…" value="${esc(filtros[clave] || "")}" data-testid="table-search-input" />
     <button class="btn" id="btn-refrescar-tabla" data-testid="refresh-table-btn">Actualizar</button>
     ${soloLectura ? "" : `<button class="btn btn-primary" id="btn-nuevo" data-testid="create-row-btn">+ Nuevo</button>`}`) +
    `<div class="table-wrap"><div class="empty">Cargando…</div></div><div class="count" id="conteo"></div>`;

  const { data, error } = await sb.from(nombre).select(cfg.select).order(cfg.orden, { ascending: false }).limit(1000);
  if (vistaActual !== clave) return;
  if (error) { $(".table-wrap").innerHTML = `<div class="empty">Error: ${esc(error.message)}</div>`; return; }
  datosTabla = data;
  pintarTabla(nombre, soloLectura);
}

function pintarTabla(nombre, soloLectura) {
  const cfg = TABLAS[nombre];
  const cols = cfg.campos.filter((c) => !c.soloForm);
  const q = (filtros[vistaActual] || "").toLowerCase();
  const filas = datosTabla.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q));
  const wrap = $(".table-wrap");
  if (!filas.length) { wrap.innerHTML = `<div class="empty" data-testid="table-empty">Sin registros.</div>`; $("#conteo").textContent = ""; return; }
  wrap.innerHTML = `<table data-testid="table-${nombre}"><thead><tr>${cols.map((c) => `<th>${esc(c.l)}</th>`).join("")}${soloLectura ? "" : "<th>Acciones</th>"}</tr></thead><tbody>${
    filas.map((r) => `<tr data-testid="row-${nombre}-${r[cfg.pk]}">${cols.map((c) => {
      if (nombre === "usuarios" && c.k === "id_rol" && !soloLectura) {
        return `<td><select class="select-inline" data-cambiar-rol="${r.id_usuario}" data-testid="admin-change-role-${r.id_usuario}">${roles.map((ro) => `<option value="${ro.id}" ${ro.id === r.id_rol ? "selected" : ""}>${esc(ro.nombre_rol)}</option>`).join("")}</select></td>`;
      }
      return `<td>${celda(c, r[c.k])}</td>`;
    }).join("")}${soloLectura ? "" : `<td class="actions">
      <button class="btn btn-sm" data-editar="${r[cfg.pk]}" data-testid="edit-row-${r[cfg.pk]}">Editar</button>
      <button class="btn btn-sm btn-danger" data-borrar="${r[cfg.pk]}" data-testid="delete-row-${r[cfg.pk]}">Eliminar</button></td>`}</tr>`).join("")
  }</tbody></table>`;
  $("#conteo").textContent = `${filas.length} de ${datosTabla.length} registros`;
}

// ---------------- MODAL CRUD ----------------
function inputCampo(c, valor, nuevo) {
  const ro = c.ro || (c.crear && !nuevo);
  const v = valor ?? "";
  const tid = `form-${c.k}`;
  let ctl;
  if (c.t === "select") ctl = `<select class="input" name="${c.k}" data-testid="${tid}">${c.ops.map((o) => `<option value="${esc(o)}" ${o === v ? "selected" : ""}>${esc(o || "—")}</option>`).join("")}</select>`;
  else if (c.t === "rol") ctl = `<select class="input" name="${c.k}" data-testid="${tid}">${roles.map((r) => `<option value="${r.id}" ${r.id === v ? "selected" : ""}>${esc(r.nombre_rol)}</option>`).join("")}</select>`;
  else {
    const tipo = { number: "number", date: "date", datetime: "datetime-local", email: "email" }[c.t] || "text";
    const val = c.t === "datetime" ? aLocalInput(v) : v;
    ctl = `<input class="input" type="${tipo}" name="${c.k}" value="${esc(val)}" ${ro ? "readonly" : ""} data-testid="${tid}" />`;
  }
  return `<div class="field"><label>${esc(c.l)} ${c.req ? '<span class="req">*</span>' : ""}</label>${ctl}${c.hint ? `<span class="hint">${esc(c.hint)}</span>` : ""}</div>`;
}

function abrirModal(nombre, fila) {
  const cfg = TABLAS[nombre];
  const nuevo = !fila;
  const campos = cfg.campos.filter((c) => !(nuevo && c.ro));
  $("#modal-root").innerHTML = `
    <div class="modal-bg" data-testid="crud-modal">
      <form class="modal" id="form-crud">
        <h3>${nuevo ? "Nuevo registro" : "Editar #" + esc(fila[cfg.pk])} · ${esc(cfg.titulo)}</h3>
        <div class="form-grid">${campos.map((c) => inputCampo(c, fila ? fila[c.k] : (c.k === "estado" ? "no usado" : c.k === "max_intento" || c.k === "reenviar_max" ? 6 : c.k === "reenviar" || c.k === "intento" ? 0 : c.k === "tiempo_para_reenviar" ? new Date().toISOString() : ""), nuevo)).join("")}</div>
        <div id="crud-error" class="alert hidden" data-testid="crud-error"></div>
        <div class="modal-foot">
          <button type="button" class="btn" id="btn-cancelar" data-testid="crud-cancel-btn">Cancelar</button>
          <button type="submit" class="btn btn-primary" data-testid="crud-save-btn">${nuevo ? "Crear" : "Guardar cambios"}</button>
        </div>
      </form>
    </div>`;
  $("#btn-cancelar").onclick = cerrarModal;
  $(".modal-bg").addEventListener("mousedown", (e) => e.target.classList.contains("modal-bg") && cerrarModal());
  $("#form-crud").onsubmit = (e) => guardarFila(e, nombre, fila);
}
function cerrarModal() { $("#modal-root").innerHTML = ""; }

async function guardarFila(ev, nombre, fila) {
  ev.preventDefault();
  const cfg = TABLAS[nombre];
  const nuevo = !fila;
  const fd = new FormData(ev.target);
  const obj = {};
  const err = (m) => { const e = $("#crud-error"); e.textContent = m; e.classList.remove("hidden"); };
  for (const c of cfg.campos) {
    if (c.ro || !fd.has(c.k)) continue;
    let v = String(fd.get(c.k)).trim();
    if (c.req && v === "") return err(`El campo "${c.l}" es obligatorio.`);
    if (c.k === "codigo") {
      if (v === "") { if (nuevo) obj.codigo = generarCodigo(); continue; }
      if (!/^\d{6}$/.test(v)) return err("El código debe tener exactamente 6 dígitos.");
    }
    if (v === "") { obj[c.k] = null; continue; }
    if (c.t === "number" || c.t === "rol") v = Number(v);
    if (c.t === "datetime") v = new Date(v).toISOString();
    obj[c.k] = v;
  }
  if (nombre === "numero" && obj.numero && !/^\+?[0-9]{7,15}$/.test(obj.numero)) return err("Número inválido (7 a 15 dígitos, puede empezar con +).");
  if (nombre === "numero" && nuevo && !obj.fecha_creado) delete obj.fecha_creado;

  const q = nuevo
    ? sb.from(nombre).insert(obj)
    : sb.from(nombre).update(obj, { count: "exact" }).eq(cfg.pk, fila[cfg.pk]);
  const { error, count } = await q;
  if (error) return err(error.message);
  if (!nuevo && count === 0) return err("No se actualizó ninguna fila (permiso RLS).");
  cerrarModal();
  toast(nuevo ? "Registro creado" : "Cambios guardados");
  vistaTabla(nombre, false);
}

async function borrarFila(nombre, id) {
  const cfg = TABLAS[nombre];
  if (!confirm(`¿Eliminar ${cfg.titulo} #${id}? Esta acción no se puede deshacer.`)) return;
  const { error, count } = await sb.from(nombre).delete({ count: "exact" }).eq(cfg.pk, id);
  if (error) return toast(error.message, "err");
  if (count === 0) return toast("No se eliminó (permiso RLS).", "err");
  toast("Registro eliminado");
  vistaTabla(nombre, false);
}

async function cambiarRol(idUsuario, idRol, select) {
  select.disabled = true;
  const { data, error } = await sb.rpc("admin_cambiar_rol", { p_id_usuario: Number(idUsuario), p_id_rol: Number(idRol) });
  select.disabled = false;
  if (error) { toast(error.message, "err"); return vistaTabla("usuarios", false); }
  if (data !== "actualizado") { toast("No se cambió: " + data, "err"); return vistaTabla("usuarios", false); }
  toast("Rol actualizado");
  const fila = datosTabla.find((r) => r.id_usuario === Number(idUsuario));
  if (fila) fila.id_rol = Number(idRol);
}

// ---------------- VISTA USUARIO NORMAL: MI PERFIL ----------------
function vistaPerfil() {
  const p = perfil;
  const campos = [
    ["nombre", "Nombre", "text"], ["apellido", "Apellido", "text"], ["numero", "Número", "text"],
    ["fecha_nacimiento", "Fecha de nacimiento", "date"], ["genero", "Género", "text"],
    ["ubicacion", "Ubicación", "text"], ["foto_perfil", "Foto de perfil (URL)", "text"],
  ];
  $("#content").innerHTML = cabecera("Mi perfil", "Tus datos personales. El rol y el correo solo los cambia el administrador.") +
    (esAdmin ? "" : `<div class="banner" data-testid="limited-view-banner">Vista limitada: tu cuenta tiene rol <b>${esc(p.rol)}</b>. Solo puedes ver y editar tu información.</div>`) +
    `<form id="form-perfil" class="register-card" style="margin:0;max-width:760px">
      <div class="form-grid">
        <div class="field"><label>Correo</label><input class="input" value="${esc(p.correo)}" readonly data-testid="profile-correo" /></div>
        <div class="field"><label>Rol</label><input class="input" value="${esc(p.rol)}" readonly data-testid="profile-rol" /></div>
        ${campos.map(([k, l, t]) => `<div class="field"><label>${l}</label><input class="input" type="${t}" name="${k}" value="${esc(p[k] || "")}" data-testid="profile-${k}-input" /></div>`).join("")}
      </div>
      <div class="modal-foot"><button class="btn btn-primary" type="submit" data-testid="profile-save-btn">Guardar</button></div>
    </form>`;
  $("#form-perfil").onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target).entries());
    if (v.numero && !/^\+?[0-9]{7,15}$/.test(v.numero.trim())) return toast("Número inválido", "err");
    const { data, error } = await sb.rpc("actualizar_mi_usuario", {
      p_nombre: v.nombre || null, p_apellido: v.apellido || null, p_numero: v.numero || null,
      p_fecha_nacimiento: v.fecha_nacimiento || null, p_genero: v.genero || null,
      p_ubicacion: v.ubicacion || null, p_foto_perfil: v.foto_perfil || null,
    });
    if (error || data !== "actualizado") return toast(error?.message || "No se actualizó: " + data, "err");
    toast("Perfil actualizado");
    const r = await sb.rpc("obtener_mi_usuario");
    if (r.data?.resultado === "ok") { perfil = r.data; mostrarPanel(); }
  };
}

// ---------------- EVENTOS ----------------
document.addEventListener("click", (e) => {
  const b = e.target.closest("button, [data-ir]");
  if (!b) return;
  if (b.id === "btn-google") return loginGoogle();
  if (b.id === "btn-logout" || b.id === "btn-reg-logout") return cerrarSesion();
  if (b.dataset.vista) return irA(b.dataset.vista);
  if (b.dataset.ir) return irA(b.dataset.ir);
  if (b.dataset.copiar !== undefined && !b.disabled) return copiar(b.dataset.copiar, b.dataset.msg);
  if (b.dataset.estado) { filtroEstado = b.dataset.estado; document.querySelectorAll("#chips-codigos .chip").forEach((x) => x.classList.toggle("active", x === b)); return pintarCodigos(); }
  if (b.id === "btn-refrescar-codigos") { toast("Actualizando…"); return cargarCodigos(); }
  const nombreTabla = vistaActual === "mis_numeros" ? "numero" : vistaActual === "mis_dispositivos" ? "dispositivos" : vistaActual;
  if (b.id === "btn-refrescar-tabla") return vistaTabla(nombreTabla, !esAdmin);
  if (b.id === "btn-nuevo") return abrirModal(nombreTabla, null);
  if (b.dataset.editar) {
    const cfg = TABLAS[nombreTabla];
    return abrirModal(nombreTabla, datosTabla.find((r) => String(r[cfg.pk]) === b.dataset.editar));
  }
  if (b.dataset.borrar) return borrarFila(nombreTabla, b.dataset.borrar);
});

document.addEventListener("input", (e) => {
  if (e.target.id === "buscar-codigos") { filtros.codigos = e.target.value; pintarCodigos(); }
  if (e.target.id === "buscar-tabla") {
    filtros[vistaActual] = e.target.value;
    const n = vistaActual === "mis_numeros" ? "numero" : vistaActual === "mis_dispositivos" ? "dispositivos" : vistaActual;
    pintarTabla(n, !esAdmin);
  }
});

document.addEventListener("change", (e) => {
  if (e.target.dataset.cambiarRol) cambiarRol(e.target.dataset.cambiarRol, e.target.value, e.target);
});

document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarModal(); });
$("#form-register").addEventListener("submit", enviarRegistro);

iniciar();
