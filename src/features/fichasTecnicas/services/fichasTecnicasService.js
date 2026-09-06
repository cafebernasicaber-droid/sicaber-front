import { fichasTecnicasApi } from '../../../shared/services/api';

const fichasTecnicasService = {
  getAll:  ()        => fichasTecnicasApi.getAll(),
  getById: (id)      => fichasTecnicasApi.getById(id),
  create:  (data)    => fichasTecnicasApi.create(data),
  update:  (id, d)   => fichasTecnicasApi.update(id, d),
  remove:  (id)      => fichasTecnicasApi.remove(id),
  toggleEstado: (id) => fichasTecnicasApi.toggleEstado(id),

  // Busca la ficha técnica asociada a un producto. La API no tiene
  // una ruta específica por producto, así que filtramos client-side.
  // El backend devuelve el campo como "id_producto" (no "producto_id").
  getByProducto: async (productoId) => {
    const data = await fichasTecnicasApi.getAll();
    const lista = Array.isArray(data) ? data : [];
    return lista.find(f => Number(f.id_producto) === Number(productoId)) || null;
  },
};

export default fichasTecnicasService;