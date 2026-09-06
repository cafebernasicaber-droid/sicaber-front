// ─────────────────────────────────────────────────────────────────────────────
//  Topes de longitud de los campos de texto — ESPEJO del backend
// ─────────────────────────────────────────────────────────────────────────────
// Estos números tienen que coincidir EXACTAMENTE con los de
// backend/src/config/validaciones.js (constante LIMITES). El servidor es
// quien manda: aunque alguien quite el maxLength desde el inspector del
// navegador, la API rechaza igual el texto que se pase de estos topes.
//
// El maxLength del navegador está aquí solo para que el usuario vea el
// límite MIENTRAS escribe, en vez de perder el trabajo al guardar y recibir
// un error del servidor.
//
// ⚠️ Si cambias un número acá, cámbialo también en el backend (y al revés).

export const LIMITES = {
  NOMBRE_CORTO:   100,  // categorías, toppings, adiciones, locales, roles
  NOMBRE:         150,  // productos, combos, insumos, proveedores, usuarios, empleados
  DESCRIPCION:    500,  // descripciones de productos, insumos, combos, categorías, adiciones
  OBSERVACIONES:  500,  // observaciones de proveedores y compras
  NOTAS_FICHA:    500,  // notas y resumen de preparación de una ficha técnica
  PREPARACION:   2000,  // paso a paso de preparación
  MOTIVO:         500,  // motivo de devolución y de anulación de compra
  MOTIVO_MINIMO:   10,  // mínimo del motivo de devolución
  RESENA:         400,  // texto de una reseña
};

// Devuelve "123 / 500" para mostrar debajo de un textarea. Cuenta el texto
// ya recortado (sin espacios al inicio/final), que es exactamente lo que
// mide el backend.
export const contador = (valor, max) => `${String(valor || '').trim().length} / ${max}`;

// true cuando el campo ya está en el tope (para pintar el contador en rojo).
export const enElTope = (valor, max) => String(valor || '').trim().length >= max;

export default LIMITES;
