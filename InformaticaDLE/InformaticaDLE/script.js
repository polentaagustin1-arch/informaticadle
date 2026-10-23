/* ============================================================
   InformáticaDLE — Lógica principal
   Depende de alumnos.js (const ALUMNOS y const PIBE_DE_PRUEBA)
   ============================================================ */

/* ---------- Navegación ---------- */
function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  window.scrollTo(0, 0);
}

function volverMenu() {
  showView("view-menu");
}

function selectMode(mode) {
  const juego = JUEGOS[mode];
  if (juego) {
    showView(juego.cfg.viewId);
    juego.init();
  } else if (mode === "wordle") {
    // Wordle ya no tiene tarjeta en el menú, pero el modo sigue disponible por código
    showView("view-wordle");
    WordleGame.init();
  } else {
    alert("Modo " + String(mode).toUpperCase() + ": pronto programaremos la lógica de este modo.");
  }
}

/* ---------- Utilidades compartidas ---------- */
const Utils = {
  // Quita tildes y pasa a minúsculas: "Pérez" -> "perez"
  normalizar(txt) {
    return txt.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  },

  // Clave del día en hora local: "2026-10-19"
  claveDia() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${dia}`;
  },

  // Número de día (para elegir el alumno del día de forma determinista)
  numeroDia() {
    const d = new Date();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  },

  // Alumno del día para un modo. Va rotando por la lista día a día, y el
  // "salt" desfasa cada modo para que no coincidan el mismo día.
  // "filtro" (opcional) deja afuera a los alumnos sin datos para ese modo.
  alumnoDelDia(salt, filtro) {
    const lista = filtro ? ALUMNOS.filter(filtro) : ALUMNOS;
    const n = lista.length;
    if (!n) return null;
    const desfase = salt * (Math.floor(n / 3) + 1);
    return lista[(Utils.numeroDia() + desfase) % n];
  },

  nombreCompleto(a) {
    return `${a.nombre} ${a.apellido}`;
  },

  // Deja solo letras A-Z y Ñ, en mayúscula y sin tildes: "María José" -> "MARIAJOSE"
  soloLetras(txt) {
    return Array.from(txt.normalize("NFC").toUpperCase())
      .map((c) => (c === "Ñ" ? "Ñ" : c.normalize("NFD").replace(/[̀-ͯ]/g, "")))
      .join("")
      .replace(/[^A-ZÑ]/g, "");
  },

  // Aviso flotante breve
  toast(mensaje) {
    const t = document.getElementById("toast");
    t.textContent = mensaje;
    t.classList.remove("hidden");
    clearTimeout(Utils._toastTimer);
    Utils._toastTimer = setTimeout(() => t.classList.add("hidden"), 1600);
  },

  // Compartir con la hoja nativa del celu o copiando al portapapeles
  async compartir(texto, boton) {
    try {
      if (navigator.share) {
        await navigator.share({ text: texto });
      } else {
        await navigator.clipboard.writeText(texto);
        const original = boton.textContent;
        boton.textContent = "¡Copiado! ✅";
        setTimeout(() => (boton.textContent = original), 1800);
      }
    } catch (e) { /* el usuario canceló */ }
  },

  guardar(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* modo privado */ }
  },

  cargar(clave) {
    try { return JSON.parse(localStorage.getItem(clave)); } catch (e) { return null; }
  }
};

/* ============================================================
   MOTOR DE ADIVINAR POR PISTAS (Modos 1, 2 y 3)
   ------------------------------------------------------------
   Los tres modos funcionan igual: hay un alumno secreto, se
   muestran pistas, y con cada error se revela una más (hasta 6
   intentos). Lo único que cambia es de dónde salen las pistas
   y cómo se dibujan (ver la configuración al final de este bloque).
   ============================================================ */
class GuessGame {
  constructor(cfg) {
    this.cfg = cfg;
    this.MAX_INTENTOS = cfg.maxIntentos || 6;
    this.construido = false;
    this.objetivo = null;
    this.pistas = [];
    this.estado = null;       // { objetivo: id, guesses: [ids], status: "playing" | "won" | "lost" }
    this.seleccionado = null; // alumno elegido en el buscador
    this.listaAbierta = false;
    this.indiceActivo = -1;
    this.nuevaIdx = -1;       // pista recién revelada (para animarla)
    this._items = [];
  }

  /* ----- Preparación ----- */
  construir() {
    const root = document.getElementById(this.cfg.viewId);
    root.appendChild(document.getElementById("tpl-game").content.cloneNode(true));
    this.root = root;
    this.el = {};
    root.querySelectorAll("[data-role]").forEach((n) => { this.el[n.dataset.role] = n; });
    this.el.title.textContent = this.cfg.titulo;
    this.el.board.className = this.cfg.claseTablero;
    this.el.list.id = "lista-" + this.cfg.key;
    this.el.input.setAttribute("aria-controls", this.el.list.id);
    this.bindEventos();
    this.construido = true;
  }

  // Alumno secreto: el fijado en PIBE_DE_PRUEBA o, si no hay, el del día
  elegirObjetivo() {
    const tieneDatos = (a) => this.cfg.getPistas(a).length >= this.cfg.minPistas;
    const fijo = typeof PIBE_DE_PRUEBA !== "undefined" ? PIBE_DE_PRUEBA[this.cfg.key] : null;
    if (fijo) {
      const a = ALUMNOS.find((x) => x.id === fijo);
      if (a && tieneDatos(a)) return a;
      console.warn(`PIBE_DE_PRUEBA.${this.cfg.key}: "${fijo}" no existe o no tiene datos suficientes. Se usa el del día.`);
    }
    return Utils.alumnoDelDia(this.cfg.salt, tieneDatos);
  }

  init() {
    if (!this.construido) this.construir();
    this.objetivo = this.elegirObjetivo();
    this.pistas = this.objetivo ? this.cfg.getPistas(this.objetivo) : [];
    this.claveGuardado = `idle_${this.cfg.key}_${Utils.claveDia()}`;
    this.seleccionado = null;
    this.nuevaIdx = -1;
    this.el.input.value = "";
    this.el.btn.disabled = true;
    this.cerrarLista();

    // Se descarta lo guardado si es de otro alumno o tiene ids que ya no existen
    const guardado = Utils.cargar(this.claveGuardado);
    const valido = this.objetivo && guardado && guardado.objetivo === this.objetivo.id &&
      Array.isArray(guardado.guesses) &&
      guardado.guesses.every((id) => ALUMNOS.some((a) => a.id === id));
    this.estado = {
      objetivo: this.objetivo ? this.objetivo.id : null,
      guesses: valido ? guardado.guesses.slice(0, this.MAX_INTENTOS) : [],
      status: "playing"
    };
    this.estado.status = this.calcularEstado();
    this.render();
  }

  calcularEstado() {
    if (!this.objetivo) return "playing";
    if (this.estado.guesses.includes(this.objetivo.id)) return "won";
    return this.estado.guesses.length >= this.MAX_INTENTOS ? "lost" : "playing";
  }

  bindEventos() {
    const { input, toggle, btn, share, list } = this.el;

    input.addEventListener("input", () => {
      this.seleccionado = null;
      this.el.btn.disabled = true;
      this.abrirLista();
    });
    input.addEventListener("focus", () => this.abrirLista());
    input.addEventListener("keydown", (e) => this.teclado(e));

    toggle.addEventListener("click", () => {
      if (this.listaAbierta) this.cerrarLista();
      else { input.focus(); this.abrirLista(); }
    });

    list.addEventListener("mousedown", (e) => e.preventDefault()); // no pierde foco
    btn.addEventListener("click", () => this.adivinar());
    share.addEventListener("click", () => this.compartir());

    // Cerrar la lista al tocar fuera del buscador
    document.addEventListener("click", (e) => {
      const dentro = e.target.closest(".combo") && this.root.contains(e.target);
      if (!dentro) this.cerrarLista();
    });
  }

  /* ----- Buscador / lista desplegable ----- */
  alumnosDisponibles() {
    const usados = new Set(this.estado.guesses);
    const q = Utils.normalizar(this.el.input.value);
    return ALUMNOS
      .filter((a) => !usados.has(a.id))
      .filter((a) => Utils.normalizar(Utils.nombreCompleto(a)).includes(q))
      .sort((a, b) => Utils.nombreCompleto(a).localeCompare(Utils.nombreCompleto(b), "es"));
  }

  abrirLista() {
    if (!this.objetivo || this.estado.status !== "playing") return;
    const items = this.alumnosDisponibles();
    const ul = this.el.list;
    ul.innerHTML = "";
    this.indiceActivo = items.length ? 0 : -1;

    if (!items.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Sin resultados";
      ul.appendChild(li);
    } else {
      items.forEach((a, i) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.textContent = Utils.nombreCompleto(a);
        if (i === 0) li.classList.add("active");
        li.addEventListener("click", () => this.elegir(a));
        ul.appendChild(li);
      });
    }
    ul.classList.remove("hidden");
    this.el.input.setAttribute("aria-expanded", "true");
    this.listaAbierta = true;
    this._items = items;
  }

  cerrarLista() {
    this.el.list.classList.add("hidden");
    this.el.input.setAttribute("aria-expanded", "false");
    this.listaAbierta = false;
  }

  elegir(alumno) {
    this.seleccionado = alumno;
    this.el.input.value = Utils.nombreCompleto(alumno);
    this.el.btn.disabled = false;
    this.cerrarLista();
  }

  teclado(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!this.listaAbierta) this.abrirLista();
      const n = this._items.length;
      if (!n) return;
      this.indiceActivo = (this.indiceActivo + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      [...this.el.list.children].forEach((li, i) => {
        li.classList.toggle("active", i === this.indiceActivo);
        if (i === this.indiceActivo) li.scrollIntoView({ block: "nearest" });
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (this.listaAbierta && this._items[this.indiceActivo]) {
        this.elegir(this._items[this.indiceActivo]);
      } else if (this.seleccionado) {
        this.adivinar();
      }
    } else if (e.key === "Escape") {
      this.cerrarLista();
    }
  }

  /* ----- Lógica del juego ----- */
  adivinar() {
    if (!this.objetivo || this.estado.status !== "playing" || !this.seleccionado) return;

    const antes = this.pistasVisibles();
    this.estado.guesses.push(this.seleccionado.id);
    this.estado.status = this.calcularEstado();
    Utils.guardar(this.claveGuardado, this.estado);

    const despues = this.pistasVisibles();
    this.nuevaIdx = this.estado.status === "playing" && despues > antes ? despues - 1 : -1;

    this.seleccionado = null;
    this.el.input.value = "";
    this.el.btn.disabled = true;
    this.cerrarLista();
    this.render();
  }

  pistasVisibles() {
    const total = this.pistas.length;
    if (this.estado.status !== "playing") return total;
    return Math.min(this.cfg.inicial + this.estado.guesses.length, total);
  }

  /* ----- Render ----- */
  render() {
    const { history, attempts, area, result, hint } = this.el;

    // Sin datos cargados para este modo
    if (!this.objetivo) {
      this.el.board.innerHTML = "";
      history.innerHTML = "";
      attempts.textContent = `0/${this.MAX_INTENTOS}`;
      hint.textContent = "Todavía no hay datos cargados para este modo. Completalos en alumnos.js.";
      area.classList.add("hidden");
      result.classList.add("hidden");
      return;
    }

    const visibles = this.pistasVisibles();
    const total = this.pistas.length;
    const intentos = this.estado.guesses.length;

    this.renderTablero(visibles);
    attempts.textContent = `${intentos}/${this.MAX_INTENTOS}`;

    // Historial
    history.innerHTML = "";
    this.estado.guesses.forEach((id) => {
      const a = ALUMNOS.find((x) => x.id === id);
      const li = document.createElement("li");
      const ok = id === this.objetivo.id;
      if (ok) li.classList.add("correct");
      const nombre = document.createElement("span");
      nombre.textContent = Utils.nombreCompleto(a);
      const marca = document.createElement("span");
      marca.textContent = ok ? "✅" : "❌";
      li.append(nombre, marca);
      history.appendChild(li);
    });

    // Texto de ayuda
    if (this.estado.status === "playing") {
      const quedan = this.MAX_INTENTOS - intentos;
      hint.textContent = visibles < total
        ? this.cfg.textoReveal
        : `${this.cfg.textoTodas} ${quedan === 1 ? "Te queda 1 intento." : "Te quedan " + quedan + " intentos."}`;
    } else {
      hint.textContent = "Partida terminada";
    }

    // Final
    const terminado = this.estado.status !== "playing";
    area.classList.toggle("hidden", terminado);
    result.classList.toggle("hidden", !terminado);
    if (terminado) this.mostrarResultado();
  }

  renderTablero(visibles) {
    const board = this.el.board;
    board.innerHTML = "";
    this.pistas.forEach((txt, i) => {
      const abierta = i < visibles;
      const el = document.createElement("div");

      if (this.cfg.tipo === "emojis") {
        el.className = "emoji-slot";
        el.textContent = abierta ? txt : "❔";
      } else {
        el.className = "clue-card";
        const num = document.createElement("span");
        num.className = "clue-num";
        num.textContent = `${this.cfg.etiqueta} ${i + 1}`;
        const cuerpo = document.createElement("span");
        cuerpo.className = "clue-text";
        cuerpo.textContent = abierta ? txt : "🔒 Bloqueada";
        el.append(num, cuerpo);
      }

      el.classList.add(abierta ? "revealed" : "locked");
      if (i === this.nuevaIdx) el.classList.add("nueva");
      board.appendChild(el);
    });
  }

  mostrarResultado() {
    const nombre = Utils.nombreCompleto(this.objetivo);
    const n = this.estado.guesses.length;
    if (this.estado.status === "won") {
      this.el.resultTitle.textContent = "🎉 ¡Lo adivinaste!";
      this.el.resultText.textContent = `Era ${nombre}. Lo lograste en ${n} ${n === 1 ? "intento" : "intentos"}.`;
    } else {
      this.el.resultTitle.textContent = "😵 Se acabaron los intentos";
      this.el.resultText.textContent = `Era ${nombre}. ¡Mañana hay revancha!`;
    }
  }

  compartir() {
    const fecha = Utils.claveDia().split("-").reverse().join("/");
    const ganado = this.estado.status === "won";
    const fila = this.estado.guesses
      .map((id) => (id === this.objetivo.id ? "🟩" : "🟥"))
      .join("");
    const resultado = ganado ? this.estado.guesses.length : "X";
    const texto = `InformáticaDLE ${this.cfg.icono} ${this.cfg.nombreCorto} ${fecha}\n${resultado}/${this.MAX_INTENTOS}\n${fila}`;
    Utils.compartir(texto, this.el.share);
  }
}

/* ---------- Configuración de cada modo ---------- */

// MODO 1: Adivina el pibe por Emojis (empieza con 3 emojis)
const EmojiGame = new GuessGame({
  key: "emojis",
  viewId: "view-emojis",
  titulo: "😎 Adivina por Emojis",
  icono: "😎",
  nombreCorto: "Emojis",
  salt: 1,
  inicial: 3,
  minPistas: 3,
  tipo: "emojis",
  claseTablero: "emoji-board",
  getPistas: (a) => a.emojis || [],
  textoReveal: "Cada error revela un emoji más 👀",
  textoTodas: "Ya ves todos los emojis."
});

// MODO 2: Palabras descriptivas (empieza con 1 palabra)
const PalabrasGame = new GuessGame({
  key: "palabras",
  viewId: "view-palabras",
  titulo: "🕵️ Palabras descriptivas",
  icono: "🕵️",
  nombreCorto: "Palabras",
  salt: 3,
  inicial: 1,
  minPistas: 3,
  tipo: "texto",
  etiqueta: "Palabra",
  claseTablero: "clue-list",
  getPistas: (a) => a.pistas || [],
  textoReveal: "Cada error desbloquea una palabra más 🔓",
  textoTodas: "Ya ves todas las palabras."
});

// MODO 3: Adivina el Personaje / Atributos (empieza con 1 pista)
const PersonajeGame = new GuessGame({
  key: "personaje",
  viewId: "view-personaje",
  titulo: "👤 Adivina el Personaje",
  icono: "👤",
  nombreCorto: "Personaje",
  salt: 4,
  inicial: 1,
  minPistas: 3,
  tipo: "texto",
  etiqueta: "Pista",
  claseTablero: "clue-list",
  getPistas: (a) => a.atributos || [],
  textoReveal: "Cada error revela una pista más 👀",
  textoTodas: "Ya ves todas las pistas."
});

// Para selectMode(): nombre del modo -> juego
const JUEGOS = { emojis: EmojiGame, palabras: PalabrasGame, personaje: PersonajeGame };

/* ============================================================
   WORDLE de Nombre y Apellido (fuera del menú principal)
   ============================================================ */
const WordleGame = {
  MAX_INTENTOS: 6,
  SALT: 2,
  TECLADO: [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ñ"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BORRAR"]
  ],

  objetivo: null,
  palabra: "",       // nombre + apellido sin espacios ni tildes
  largo: 0,
  largoNombre: 0,
  estado: null,      // { id, guesses: ["JUANPEREZ"], status: "playing" | "won" | "lost" }
  actual: "",        // lo que se está escribiendo
  filaAnimada: -1,
  bloqueado: false,  // mientras corre la animación de revelado
  listeners: false,

  init() {
    this.objetivo = Utils.alumnoDelDia(this.SALT);
    this.palabra = Utils.soloLetras(this.objetivo.nombre + this.objetivo.apellido);
    this.largo = this.palabra.length;
    this.largoNombre = Utils.soloLetras(this.objetivo.nombre).length;
    this.claveGuardado = "idle_wordle_" + Utils.claveDia();

    // Estado guardado (se descarta si no corresponde al alumno de hoy)
    let guardado = Utils.cargar(this.claveGuardado);
    const valido = guardado && guardado.id === this.objetivo.id &&
      Array.isArray(guardado.guesses) &&
      guardado.guesses.every((g) => typeof g === "string" && g.length === this.largo);
    this.estado = valido ? guardado : { id: this.objetivo.id, guesses: [], status: "playing" };

    this.actual = "";
    this.filaAnimada = -1;
    this.bloqueado = false;

    this.el = {
      board: document.getElementById("wordle-board"),
      kb: document.getElementById("wordle-keyboard"),
      attempts: document.getElementById("wordle-attempts"),
      hint: document.getElementById("wordle-hint"),
      result: document.getElementById("wordle-result"),
      resultTitle: document.getElementById("wordle-result-title"),
      resultText: document.getElementById("wordle-result-text"),
      share: document.getElementById("wordle-share")
    };

    this.construirTeclado();
    if (!this.listeners) this.bindEventos();

    const apellidoLen = this.largo - this.largoNombre;
    this.el.hint.textContent = `Nombre: ${this.largoNombre} letras • Apellido: ${apellidoLen} letras`;

    this.renderTablero();
    this.renderTeclado();
    this.renderFinal();
  },

  bindEventos() {
    this.listeners = true;

    // Teclado físico (solo cuando la pantalla del Wordle está visible)
    document.addEventListener("keydown", (e) => {
      if (document.getElementById("view-wordle").classList.contains("hidden")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Enter") {
        e.preventDefault();
        this.pulsar("ENTER");
      } else if (e.key === "Backspace") {
        e.preventDefault();
        this.pulsar("BORRAR");
      } else if (e.key.length === 1) {
        const letra = Utils.soloLetras(e.key);
        if (letra.length === 1) this.pulsar(letra);
      }
    });

    // Teclado virtual
    this.el.kb.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-key]");
      if (btn) this.pulsar(btn.dataset.key);
    });

    this.el.share.addEventListener("click", () => this.compartir());
  },

  /* ----- Entrada ----- */
  pulsar(tecla) {
    if (this.estado.status !== "playing" || this.bloqueado) return;

    if (tecla === "ENTER") {
      this.enviar();
    } else if (tecla === "BORRAR") {
      this.actual = this.actual.slice(0, -1);
      this.renderTablero();
    } else if (this.actual.length < this.largo) {
      this.actual += tecla;
      this.renderTablero();
    }
  },

  enviar() {
    if (this.actual.length < this.largo) {
      Utils.toast("Faltan letras");
      const fila = this.el.board.children[this.estado.guesses.length];
      if (fila) {
        fila.classList.add("shake");
        setTimeout(() => fila.classList.remove("shake"), 500);
      }
      return;
    }

    const intento = this.actual;
    this.estado.guesses.push(intento);
    this.actual = "";

    if (intento === this.palabra) this.estado.status = "won";
    else if (this.estado.guesses.length >= this.MAX_INTENTOS) this.estado.status = "lost";

    Utils.guardar(this.claveGuardado, this.estado);

    // Animación de revelado: se bloquea la entrada hasta que termina
    this.filaAnimada = this.estado.guesses.length - 1;
    this.bloqueado = true;
    this.renderTablero();

    setTimeout(() => {
      this.bloqueado = false;
      this.filaAnimada = -1;
      this.renderTeclado();
      this.renderFinal();
    }, this.largo * 200 + 600);
  },

  /* ----- Colores (con letras repetidas bien resueltas) ----- */
  evaluar(intento) {
    const res = Array(this.largo).fill("absent");
    const restantes = {};

    // 1ª pasada: verdes; se cuentan las letras de la palabra que quedan libres
    for (let i = 0; i < this.largo; i++) {
      if (intento[i] === this.palabra[i]) res[i] = "correct";
      else restantes[this.palabra[i]] = (restantes[this.palabra[i]] || 0) + 1;
    }
    // 2ª pasada: amarillos, sin superar la cantidad de veces que aparece la letra
    for (let i = 0; i < this.largo; i++) {
      if (res[i] !== "correct" && restantes[intento[i]] > 0) {
        res[i] = "present";
        restantes[intento[i]]--;
      }
    }
    return res;
  },

  estadoTeclas() {
    const prioridad = { absent: 1, present: 2, correct: 3 };
    const teclas = {};
    this.estado.guesses.forEach((g, idx) => {
      // La fila que se está animando todavía no pinta el teclado
      if (idx === this.filaAnimada) return;
      const res = this.evaluar(g);
      for (let i = 0; i < g.length; i++) {
        const actual = teclas[g[i]];
        if (!actual || prioridad[res[i]] > prioridad[actual]) teclas[g[i]] = res[i];
      }
    });
    return teclas;
  },

  /* ----- Render ----- */
  renderTablero() {
    const { board, attempts } = this.el;
    board.innerHTML = "";
    const gap = this.largo > 11 ? 3 : 5;

    for (let r = 0; r < this.MAX_INTENTOS; r++) {
      const fila = document.createElement("div");
      fila.className = "wordle-row";
      fila.style.setProperty("--cols", this.largo);
      fila.style.setProperty("--gap", gap + "px");

      const enviado = r < this.estado.guesses.length;
      const escribiendo = r === this.estado.guesses.length && this.estado.status === "playing";
      const texto = enviado ? this.estado.guesses[r] : escribiendo ? this.actual : "";
      const colores = enviado ? this.evaluar(texto) : null;

      for (let i = 0; i < this.largo; i++) {
        const t = document.createElement("div");
        t.className = "tile";
        if (i === this.largoNombre - 1 && this.largoNombre < this.largo) t.classList.add("sep");
        if (texto[i]) {
          t.textContent = texto[i];
          t.classList.add("filled");
        }
        if (colores) {
          t.classList.add(colores[i]);
          if (r === this.filaAnimada) {
            t.classList.add("flip");
            t.style.setProperty("--i", i);
          }
        }
        fila.appendChild(t);
      }
      board.appendChild(fila);
    }

    attempts.textContent = `${this.estado.guesses.length}/${this.MAX_INTENTOS}`;
  },

  construirTeclado() {
    const kb = this.el.kb;
    if (kb.children.length) return; // ya construido
    this.TECLADO.forEach((letras) => {
      const fila = document.createElement("div");
      fila.className = "kb-row";
      letras.forEach((k) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "key";
        b.dataset.key = k;
        if (k === "ENTER") { b.textContent = "Enviar"; b.classList.add("wide"); b.setAttribute("aria-label", "Enviar"); }
        else if (k === "BORRAR") { b.textContent = "⌫"; b.classList.add("wide"); b.setAttribute("aria-label", "Borrar"); }
        else b.textContent = k;
        fila.appendChild(b);
      });
      kb.appendChild(fila);
    });
  },

  renderTeclado() {
    const teclas = this.estadoTeclas();
    this.el.kb.querySelectorAll(".key").forEach((b) => {
      b.classList.remove("correct", "present", "absent");
      const est = teclas[b.dataset.key];
      if (est) b.classList.add(est);
    });
  },

  renderFinal() {
    const terminado = this.estado.status !== "playing";
    this.el.result.classList.toggle("hidden", !terminado);
    this.el.kb.classList.toggle("locked", terminado);
    if (!terminado) return;

    const nombre = Utils.nombreCompleto(this.objetivo);
    const n = this.estado.guesses.length;
    if (this.estado.status === "won") {
      this.el.resultTitle.textContent = "🎉 ¡Lo adivinaste!";
      this.el.resultText.textContent = `Era ${nombre}. Lo lograste en ${n} ${n === 1 ? "intento" : "intentos"}.`;
    } else {
      this.el.resultTitle.textContent = "😵 Se acabaron los intentos";
      this.el.resultText.textContent = `Era ${nombre}. ¡Mañana hay revancha!`;
    }
  },

  /* ----- Compartir ----- */
  compartir() {
    const fecha = Utils.claveDia().split("-").reverse().join("/");
    const iconos = { correct: "🟩", present: "🟨", absent: "⬛" };
    const filas = this.estado.guesses
      .map((g) => this.evaluar(g).map((c) => iconos[c]).join(""))
      .join("\n");
    const resultado = this.estado.status === "won" ? this.estado.guesses.length : "X";
    const texto = `InformáticaDLE 🔤 Wordle ${fecha}\n${resultado}/${this.MAX_INTENTOS}\n\n${filas}`;
    Utils.compartir(texto, this.el.share);
  }
};
