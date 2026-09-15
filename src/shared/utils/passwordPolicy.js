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
// Regla vigente (Ronda 23 — reemplaza la anterior de 10 mín. + 8 dígitos):
//   • entre 10 y 20 caracteres (ahora con tope máximo)
//   • al menos 1 letra minúscula
//   • al menos 1 letra MAYÚSCULA
//   • al menos 1 dígito numérico (antes exigía 8; ahora basta con 1)
//   • al menos 1 carácter especial (ni letra, ni número)
//
// ⚠️ Si cambias algo acá, cámbialo también en el backend (y al revés).

export const PASSWORD_MIN_LONGITUD = 10;
export const PASSWORD_MAX_LONGITUD = 20;

// Regex exacto acordado con el backend: minúscula + mayúscula + dígito +
// especial, todo dentro de una longitud de 10 a 20.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,20}$/;

const RE_MINUSCULA = /[a-z]/;
const RE_MAYUSCULA = /[A-Z]/;
const RE_DIGITO    = /\d/;
const RE_ESPECIAL  = /[^A-Za-z0-9]/;

// Texto corto para mostrar como ayuda (placeholder / subtítulo).
export const PASSWORD_AYUDA =
  `${PASSWORD_MIN_LONGITUD}-${PASSWORD_MAX_LONGITUD} caracteres · mayúscula · minúscula · número · carácter especial`;

// Lista de requisitos con su estado de cumplimiento, para pintar la
// checklist en vivo debajo del campo. Así el usuario VE qué le falta
// mientras escribe, en vez de descubrirlo al intentar guardar.
export const requisitosPassword = (password) => {
  const p = String(password || '');
  return [
    { clave: 'longitud', texto: `Entre ${PASSWORD_MIN_LONGITUD} y ${PASSWORD_MAX_LONGITUD} caracteres`, cumple: p.length >= PASSWORD_MIN_LONGITUD && p.length <= PASSWORD_MAX_LONGITUD },
    { clave: 'minus',    texto: 'Al menos 1 letra minúscula',                       cumple: RE_MINUSCULA.test(p) },
    { clave: 'mayus',    texto: 'Al menos 1 letra mayúscula',                       cumple: RE_MAYUSCULA.test(p) },
    { clave: 'digito',   texto: 'Al menos 1 número',                                cumple: RE_DIGITO.test(p) },
    { clave: 'especial', texto: 'Al menos 1 carácter especial (# $ % & * -)',       cumple: RE_ESPECIAL.test(p) },
  ];
};

export const passwordValida = (password) =>
  typeof password === 'string' && PASSWORD_REGEX.test(password);

// Mensaje único y fijo, igual al que devuelve la API — el negocio pidió
// UN solo mensaje para toda contraseña que no cumpla, en vez de un detalle
// por requisito faltante.
const PASSWORD_ERROR =
  'La contraseña debe tener entre 10 y 20 caracteres, con al menos una mayúscula, una minúscula, un número y un carácter especial.';

// Devuelve null cuando la contraseña sí cumple.
export const errorPassword = (password) => {
  if (!password) return 'La contraseña es obligatoria.';
  return passwordValida(password) ? null : PASSWORD_ERROR;
};

export default { passwordValida, errorPassword, requisitosPassword, PASSWORD_AYUDA };
