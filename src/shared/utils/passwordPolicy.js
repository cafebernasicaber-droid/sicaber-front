// ─────────────────────────────────────────────────────────────────────────────
//  Política de contraseña — ESPEJO del backend
// ─────────────────────────────────────────────────────────────────────────────
// Estas reglas tienen que coincidir EXACTAMENTE con las de
// sicaber-back-main/src/config/passwordPolicy.js. El servidor es quien
// manda: aunque alguien salte esta validación desde el inspector del
// navegador, la API rechaza igual la contraseña.
//
// Esto vive acá para que TODAS las pantallas que crean o cambian una
// contraseña usen la misma regla. Antes cada una tenía la suya: Usuarios
// pedía 6 caracteres, la tienda en línea 8 + mayúscula, y el servidor 10 —
// así que el usuario recibía un error del servidor después de que su propio
// formulario le había dicho que estaba bien.
//
// Regla única:
//   • mínimo 10 caracteres
//   • al menos 8 dígitos numéricos
//   • al menos 1 letra MAYÚSCULA
//   • al menos 1 carácter especial (ni letra, ni número, ni espacio)
//
// ⚠️ Si cambias un número acá, cámbialo también en el backend (y al revés).

export const PASSWORD_MIN_LONGITUD = 10;
export const PASSWORD_MIN_DIGITOS  = 8;

// Letras con acentos y ñ listadas explícitamente para que "ñ" o "é" nunca
// se cuenten por error como "carácter especial".
const LETRAS = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
const RE_MAYUSCULA = /[A-ZÁÉÍÓÚÜÑ]/;
const RE_ESPECIAL  = new RegExp(`[^${LETRAS}0-9\\s]`);

const contarDigitos = (password) => (String(password || '').match(/\d/g) || []).length;

// Texto corto para mostrar como ayuda (placeholder / subtítulo).
export const PASSWORD_AYUDA =
  `Mín. ${PASSWORD_MIN_LONGITUD} caracteres · ${PASSWORD_MIN_DIGITOS} números · 1 mayúscula · 1 especial`;

// Lista de requisitos con su estado de cumplimiento, para pintar la
// checklist en vivo debajo del campo. Así el usuario VE qué le falta
// mientras escribe, en vez de descubrirlo al intentar guardar.
export const requisitosPassword = (password) => {
  const p = String(password || '');
  const digitos = contarDigitos(p);
  return [
    { clave: 'longitud', texto: `Mínimo ${PASSWORD_MIN_LONGITUD} caracteres`,       cumple: p.length >= PASSWORD_MIN_LONGITUD },
    { clave: 'digitos',  texto: `Al menos ${PASSWORD_MIN_DIGITOS} números`,          cumple: digitos >= PASSWORD_MIN_DIGITOS },
    { clave: 'mayus',    texto: 'Al menos 1 letra mayúscula',                        cumple: RE_MAYUSCULA.test(p) },
    { clave: 'especial', texto: 'Al menos 1 carácter especial (# $ % & * -)',        cumple: RE_ESPECIAL.test(p) },
  ];
};

export const passwordValida = (password) =>
  typeof password === 'string' && requisitosPassword(password).every(r => r.cumple);

// Mensaje específico de qué falta, con el mismo formato que devuelve la API
// (para que el usuario lea siempre lo mismo, venga de donde venga el error).
// Devuelve null cuando la contraseña sí cumple.
export const errorPassword = (password) => {
  if (!password) return 'La contraseña es obligatoria.';
  const p = String(password);
  const faltas = [];
  if (p.length < PASSWORD_MIN_LONGITUD) faltas.push(`debe tener mínimo ${PASSWORD_MIN_LONGITUD} caracteres (tiene ${p.length})`);
  const digitos = contarDigitos(p);
  if (digitos < PASSWORD_MIN_DIGITOS) faltas.push(`debe incluir al menos ${PASSWORD_MIN_DIGITOS} números (tiene ${digitos})`);
  if (!RE_MAYUSCULA.test(p)) faltas.push('debe incluir al menos 1 letra mayúscula');
  if (!RE_ESPECIAL.test(p))  faltas.push('debe incluir al menos 1 carácter especial (por ejemplo: # $ % & * -)');
  if (faltas.length === 0) return null;
  return `La contraseña ${faltas.join(', ')}.`;
};

export default { passwordValida, errorPassword, requisitosPassword, PASSWORD_AYUDA };
