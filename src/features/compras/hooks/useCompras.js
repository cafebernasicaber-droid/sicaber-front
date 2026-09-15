import { useState, useCallback, useEffect } from 'react';
import comprasService from '../services/comprasService';

const useCompras = () => {
  const [compras, setCompras] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    comprasService.getActivas()
      .then(data => setCompras(Array.isArray(data) ? data : []))
      .catch(() => setCompras([]))
      .finally(() => setLoading(false));
  }, []);

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
  // Igual patrón que create(): api.js lanza (throw) si el backend rechaza
  // la anulación (ej. un insumo ya anulado del todo, o una cantidad mayor a
  // la pendiente) — se captura acá para que ComprasPage pueda mostrar el
  // error real con un simple `if (r?.error)`, sin que un `await` suelto sin
  // try/catch deje la promesa rechazada sin manejar.
  const anular = useCallback(async (id, motivo, items) => {
    try {
      const r = await comprasService.anular(id, motivo, items);
      refresh();
      return r;
    } catch (err) {
      return { error: err.message };
    }
  }, [refresh]);
  const getById = useCallback((id) => comprasService.getById(id), []);
  const getHistorial = useCallback(() => comprasService.getHistorial(), []);

  return { compras, loading, refresh, create, anular, getById, getHistorial };
};

export default useCompras;