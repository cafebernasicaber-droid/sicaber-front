import { useState, useCallback, useEffect } from 'react';
import tiposPresentacionService from '../services/tiposPresentacionService';

const useTiposPresentacion = () => {
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    tiposPresentacionService.getAll()
      .then(data => setTipos(Array.isArray(data) ? data : []))
      .catch(() => setTipos([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (d) => { const r = await tiposPresentacionService.create(d); refresh(); return r; }, [refresh]);
  const update = useCallback(async (id, d) => { const r = await tiposPresentacionService.update(id, d); refresh(); return r; }, [refresh]);
  const toggleEstado = useCallback(async (id) => { const r = await tiposPresentacionService.toggleEstado(id); refresh(); return r; }, [refresh]);

  return { tipos, loading, refresh, create, update, toggleEstado };
};

export default useTiposPresentacion;