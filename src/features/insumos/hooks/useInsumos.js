import { useState, useCallback, useEffect } from 'react';
import insumosService from '../services/insumosService';

const useInsumos = () => {
  const [insumos, setInsumos] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    insumosService.getAll()
      .then(data => setInsumos(Array.isArray(data) ? data : []))
      .catch(() => setInsumos([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

const create = useCallback(async (d) => {
  try {
    const r = await insumosService.create(d);
    refresh();
    return r;
  } catch (err) {
    return { error: err.message };
  }
}, [refresh]);

  // Antes solo `create` tenía este try/catch. `update` llamaba a
  // insumosService.update sin capturar nada: api.js lanza (throw) cuando
  // el backend responde con error, y ModalFormInsumo.handleSubmit tampoco
  // tiene try/catch propio — esa excepción quedaba sin capturar en toda la
  // cadena y el modal de "Editar insumo" no mostraba ningún mensaje.
  //
  // Cambio 1 (edición de insumos por local) — `d` ahora puede traer, además
  // de los campos GLOBALES de siempre (nombre/categoría/unidad/estado/
  // descripción), 3 claves de UN SOLO local: `localId`/`localStockMinimo`/
  // `localActivo` (ver construirPayloadInsumo.js). Se separan acá y van a
  // DOS peticiones distintas: la global de siempre (PUT /insumos/:id, que
  // nunca leyó nada de locales) y una nueva al endpoint POR LOCAL
  // (PUT /insumos/:id/locales/:localId) — el único que de verdad guarda el
  // stock mínimo y el estado activo de ese local, sin poder tocar ningún
  // otro (el id del local va en la URL, no en un body que podría traer
  // ceros para los demás).
  const update = useCallback(async (id, d) => {
    const { localId, localStockMinimo, localActivo, ...camposGlobales } = d;
    try {
      const r = await insumosService.update(id, camposGlobales);
      if (localId != null) {
        try {
          await insumosService.updateLocal(id, localId, { stockMinimo: localStockMinimo, activo: localActivo });
        } catch (errLocal) {
          // Los campos globales SÍ se guardaron — no se pierde ese cambio,
          // pero el usuario debe enterarse de que el stock/mínimo de este
          // local no se actualizó, para que no piense que sí quedó.
          refresh();
          return { error: `Se guardaron nombre/categoría/etc., pero no el stock de este local: ${errLocal.message}` };
        }
      }
      refresh();
      return r;
    } catch (err) {
      return { error: err.message };
    }
  }, [refresh]);
  const remove = useCallback(async (id) => { const r = await insumosService.remove(id); refresh(); return r; }, [refresh]);
  const toggleEstado = useCallback(async (id) => { const r = await insumosService.toggleEstado(id); refresh(); return r; }, [refresh]);
  const getById = useCallback((id) => insumosService.getById(id), []);

  return { insumos, loading, refresh, create, update, remove, toggleEstado, getById };
};

export default useInsumos;