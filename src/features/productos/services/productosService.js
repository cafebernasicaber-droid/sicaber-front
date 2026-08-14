import { productosApi } from '../../../shared/services/api';

// El carrito (Landing.jsx) identifica los combos con un id sintético tipo
// "combo-5" para poder mezclarlos con productos reales en el mismo
// arreglo. Se usa antes de pedir el "precio original" de un ítem del
// carrito: ese dato solo existe para productos reales (con descuento), así
// que para un combo ni siquiera vale la pena llamar al backend.
export const esIdCombo = (id) => typeof id === 'string' && id.startsWith('combo-');

// El backend usa fecha_inicio_desc / fecha_fin_desc
export const descuentoVigente = (p) => {
  if (!p?.descuento || p.descuento <= 0) return null;
  const hoy = new Date().toISOString().slice(0, 10);
  if (p.fecha_inicio_desc && hoy < p.fecha_inicio_desc) return null;
  if (p.fecha_fin_desc    && hoy > p.fecha_fin_desc)    return null;
  return p.descuento;
};

export const calcPrecioFinal = (p) => {
  const desc = descuentoVigente(p);
  if (!desc) return p?.precio ?? 0;
  return Math.round(p.precio * (1 - desc / 100));
};

const productosService = {
  getActivos: ()        => productosApi.getActivos(),
  getAll:     ()        => productosApi.getAll(),
  getById:    (id)      => productosApi.getById(id),
  create:     (data)    => productosApi.create(data),
  update:     (id, d)   => productosApi.update(id, d),
  remove:     (id)      => productosApi.remove(id),
  toggleEstado: (id)      => productosApi.toggleEstado(id),
};

export default productosService;