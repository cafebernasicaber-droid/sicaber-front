// ─────────────────────────────────────────────────────────────
//  src/shared/utils/toppings.js
//
//  Regla única para "¿qué toppings aplican a este producto?": un topping
//  sin productos_ids (o con el arreglo vacío) aplica a cualquier producto;
//  si trae ids, solo aplica a los que estén en ese arreglo. Antes esta
//  misma regla estaba copiada en Landing.jsx y CajeroPage.jsx — se
//  centraliza aquí para no seguir duplicándola (p.ej. al agregarla también
//  en CombosPage.jsx).
// ─────────────────────────────────────────────────────────────

export const toppingsParaProducto = (toppings, productoId) => {
  if (!productoId) return [];
  return (Array.isArray(toppings) ? toppings : []).filter(t =>
    !Array.isArray(t.productos_ids) || t.productos_ids.length === 0 || t.productos_ids.includes(productoId)
  );
};
