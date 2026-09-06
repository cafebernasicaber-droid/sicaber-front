// ─────────────────────────────────────────────────────────────
//  src/shared/utils/textFormat.js
//
//  Normaliza, solo para presentación, textos que llegan en MAYÚSCULAS
//  SOSTENIDAS (típico de datos digitados con Bloq Mayús activado) a
//  formato de título legible ("CAFE LA FINCA" -> "Cafe La Finca"). Nunca
//  modifica el dato guardado, solo cómo se muestra. Si el texto ya viene
//  en mayúsculas y minúsculas mixtas (siglas, nombres ya bien formateados)
//  se deja intacto para no romperlo.
// ─────────────────────────────────────────────────────────────
export const formatoTitulo = (str) => {
  if (!str || typeof str !== 'string') return str;
  const tieneLetras = /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(str);
  if (!tieneLetras || str !== str.toUpperCase()) return str;
  return str
    .toLowerCase()
    .replace(/(^|\s|-)([a-záéíóúñ])/g, (_, sep, letra) => sep + letra.toUpperCase());
};

// ─────────────────────────────────────────────────────────────
//  Normaliza un texto para *compararlo* (nunca para mostrarlo): quita
//  espacios sobrantes, pasa a minúsculas y elimina tildes/acentos, para
//  que "cafe", "Cafe", "CAFÉ" y "CaFe" se consideren el mismo valor al
//  validar duplicados (ej. categorías de insumos).
// ─────────────────────────────────────────────────────────────
export const normalizarComparacion = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quita diacríticos (tildes, diéresis, etc.)
};