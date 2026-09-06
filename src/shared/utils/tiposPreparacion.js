// ─────────────────────────────────────────────────────────────────────────────
//  Tipo de preparación de una ficha técnica — ESPEJO del backend
// ─────────────────────────────────────────────────────────────────────────────
// Copia exacta de sicaber-back-main/src/config/tiposPreparacion.js. El
// servidor aplica estas mismas reglas al guardar, así que lo que muestra el
// formulario y lo que queda en la base de datos siempre coinciden.
//
// El "tipo de preparación" NO es un dato que el administrador deba elegir a
// mano: se desprende de la categoría del producto. Si el producto es de
// "bebidas calientes", su ficha es Caliente; si es de "bebidas frías" o
// "jugos naturales", es Frío. Antes había que seleccionarlo aparte, y nada
// impedía guardar una ficha "Caliente" para una bebida fría.
//
// `derivarTipoPreparacion` devuelve null cuando la categoría no permite
// deducirlo (una categoría nueva cuyo nombre no dice nada sobre cómo se
// prepara). Solo en ese caso el formulario deja elegir el tipo a mano.
//
// ⚠️ Si cambias las listas de abajo, cámbialas también en el backend.

export const CATEGORIAS_PREP = ['Caliente', 'Frío', 'Batido', 'Al vapor', 'Sin preparación'];

export const CATEGORIA_PREP_DEFECTO = 'Caliente';

// Minúsculas, sin tildes y sin espacios sobrantes: así "Bebidas  Frías" y
// "bebidas frias" se tratan igual (en la base de datos real existen ambas).
const normalizar = (texto) => String(texto ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

// Reglas en ORDEN DE PRIORIDAD: gana la primera que coincida. El orden
// importa — "malteadas frías" debe quedar como Batido (manda la técnica),
// no como Frío.
const REGLAS = [
  { tipo: 'Al vapor',        claves: ['vapor'] },
  { tipo: 'Batido',          claves: ['batid', 'malteada', 'smoothie', 'frappe', 'licuad', 'granizad', 'milkshake'] },
  { tipo: 'Caliente',        claves: ['calient'] },
  // Raíces completas ('frio'/'fria'/'helad') en vez de un simple 'fri',
  // para que una categoría como "fritos" no se clasifique como Frío.
  { tipo: 'Frío',            claves: ['frio', 'fria', 'helad', 'congelad', 'refriger', 'fresc', 'jugo', 'limonada', 'gaseosa', 'soda', 'iced'] },
  { tipo: 'Sin preparación', claves: ['sin preparacion', 'postre', 'panader', 'reposter', 'snack', 'empaquet', 'paquete'] },
];

export const derivarTipoPreparacion = (categoriaProducto) => {
  const cat = normalizar(categoriaProducto);
  if (!cat) return null;
  for (const regla of REGLAS) {
    if (regla.claves.some(clave => cat.includes(clave))) return regla.tipo;
  }
  return null;
};

export const tipoPreparacionValido = (valor) => CATEGORIAS_PREP.includes(String(valor ?? '').trim());

// Valor definitivo de categoria_prep: manda la derivación cuando existe; si
// no, se respeta lo elegido por el usuario; y como último recurso, el valor
// por defecto.
export const resolverTipoPreparacion = (categoriaProducto, valorRecibido) => {
  const derivado = derivarTipoPreparacion(categoriaProducto);
  if (derivado) return derivado;
  const recibido = String(valorRecibido ?? '').trim();
  if (tipoPreparacionValido(recibido)) return recibido;
  return CATEGORIA_PREP_DEFECTO;
};

export default { CATEGORIAS_PREP, derivarTipoPreparacion, resolverTipoPreparacion };
