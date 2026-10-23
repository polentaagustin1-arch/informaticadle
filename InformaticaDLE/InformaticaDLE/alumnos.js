/* ============================================================
   InformáticaDLE — Lista de alumnos
   ------------------------------------------------------------
   Cada alumno tiene:

   - id         : texto único (no repetir), por ejemplo "ciro-minguillo"
   - nombre     : nombre (para el buscador)
   - apellido   : apellido (para el buscador)
   - emojis     : Modo 1. De 3 a 5 emojis. Se ven los primeros 3 y cada
                  error revela uno más. Poné los más difíciles primero.
   - pistas     : Modo 2 (Palabras descriptivas). Lista de palabras en
                  orden: se ve la 1ª y cada error desbloquea la siguiente.
                  Mínimo 3 palabras para que el alumno pueda salir en el modo.
   - atributos  : Modo 3 (Adivina el Personaje). Lista de pistas en orden
                  (ej: "Nació en enero", "Grupo: los del fondo").
                  Mínimo 3 pistas para que el alumno pueda salir en el modo.

   Los alumnos con listas vacías ([]) NO salen en ese modo hasta que
   les cargues datos.
   ============================================================ */

const ALUMNOS = [
  {
    id: "francisco-estebanez",
    nombre: "Francisco",
    apellido: "Estebanez",
    emojis: ["👨‍🦲", "🔴", "⚪"],
    pistas: [],
    atributos: []
  },
  {
    id: "ciro-minguillo",
    nombre: "Ciro",
    apellido: "Minguillo",
    emojis: ["🛹", "🏀", "🍕"],
    pistas: [],
    atributos: []
  },
  {
    id: "ezequiel-sanchez",
    nombre: "Ezequiel",
    apellido: "Sanchez",
    emojis: ["📱", "🚗", "💪"],
    pistas: [],
    atributos: []
  },
  {
    id: "bautista-rodriguez",
    nombre: "Bautista",
    apellido: "Rodriguez",
    emojis: ["⚽", "🧉", "🎮"],
    pistas: [],
    atributos: []
  },
  {
    id: "agustin-polenta",
    nombre: "Agustín",
    apellido: "Polenta",
    emojis: ["🎸", "🎧", "🍕"],
    pistas: [],
    atributos: ["Mangas", "LoL", "Nació en enero", "Comida"]
  },
  {
    id: "leandro-rodriguez",
    nombre: "Leandro",
    apellido: "Rodríguez",
    emojis: ["💻", "📊", "☕"],
    pistas: [],
    atributos: []
  },
  {
    id: "benjamin-echeverria",
    nombre: "Benjamín",
    apellido: "Echeverría",
    emojis: ["📚", "♟️", "🕹️"],
    pistas: [],
    atributos: []
  },
  {
    id: "felipe-amalberti",
    nombre: "Felipe",
    apellido: "Amalberti",
    emojis: ["🎨", "📸", "🎧"],
    pistas: [],
    atributos: []
  },
  {
    id: "agustin-gajate",
    nombre: "Agustín",
    apellido: "Gajate",
    emojis: ["⚽", "🏃", "🏆"],
    pistas: [],
    atributos: []
  },
  {
    id: "nacho-diaz-rimolo",
    nombre: "Nacho",
    apellido: "Díaz Rimolo",
    emojis: ["🔥", "🎮", "🍔"],
    pistas: [],
    atributos: []
  },
  {
    id: "gino-ostolaza",
    nombre: "Gino",
    apellido: "Ostolaza",
    emojis: ["🕶️", "🏋️", "🎵"],
    pistas: [],
    atributos: []
  },
  {
    id: "valentin-diaz",
    nombre: "Valentín",
    apellido: "Díaz",
    emojis: ["⚡", "💻", "🎮"],
    pistas: ["Anteojos", "Alto", "Gym"],
    atributos: []
  }
];

/* ------------------------------------------------------------
   PIBE DE PRUEBA
   Fija qué alumno sale en cada modo, sin importar el día.
   Para volver a la rotación diaria automática, dejá el bloque
   así:  const PIBE_DE_PRUEBA = {};
   ------------------------------------------------------------ */
const PIBE_DE_PRUEBA = {
  emojis: "francisco-estebanez",
  palabras: "valentin-diaz",
  personaje: "agustin-polenta"
};

/* Validación rápida: avisa por consola si hay errores en los datos */
(function validarAlumnos() {
  const ids = new Set();
  ALUMNOS.forEach((a) => {
    if (ids.has(a.id)) console.warn("ID repetido:", a.id, a.nombre);
    ids.add(a.id);
    if (!a.emojis || a.emojis.length < 3 || a.emojis.length > 5) {
      console.warn("Emojis: tienen que ser de 3 a 5 →", a.nombre, a.apellido);
    }
    if (!Array.isArray(a.pistas)) console.warn("pistas tiene que ser una lista →", a.nombre);
    if (!Array.isArray(a.atributos)) console.warn("atributos tiene que ser una lista →", a.nombre);
  });
  Object.entries(PIBE_DE_PRUEBA).forEach(([modo, id]) => {
    if (!ids.has(id)) console.warn("PIBE_DE_PRUEBA: no existe el id", id, "(modo " + modo + ")");
  });
})();
