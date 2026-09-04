import { useState, useCallback, useEffect } from 'react';
import comprasService from '../services/comprasService';

// `localId` opcional: si se pasa (y no es 'todos'), solo trae las compras de
// ese local — el backend lo filtra vía GET /compras?local_id=.
const useCompras = (localId) => {
  const [compras, setCompras] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    comprasService.getActivas(localId)
      .then(data => setCompras(Array.isArray(data) ? data : []))
      .catch(() => setCompras([]))
      .finally(() => setLoading(false));
  }, [localId]);

  useEffect(() => { refresh(); }, [refresh]);

  // api.js lanza (throw) cuando el backend rechaza la compra — se captura
  // acá (mismo patrón que useInsumos.js) para que ComprasPage pueda
  // mostrar el error con un simple `if (r?.error)` en vez de necesitar su
  // propio try/catch alrededor de cada llamada a create().
  const create = useCallback(async (d) => {
    try {
      const r = await comprasService.create(d);
      refresh();
      return r;
    } catch (err) {
      return { error: err.message };
    }
  }, [refresh]);
  const anular = useCallback(async (id, motivo) => { const r = await comprasService.anular(id, motivo); refresh(); return r; }, [refresh]);
  const getById = useCallback((id) => comprasService.getById(id), []);
  const getHistorial = useCallback(() => comprasService.getHistorial(), []);

  return { compras, loading, refresh, create, anular, getById, getHistorial };
};

export default useCompras;