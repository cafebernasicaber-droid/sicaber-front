import { useState, useCallback, useEffect } from 'react';
import categoriasInsumosService from '../services/categoriasInsumosService';

const useCategoriasInsumos = () => {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    categoriasInsumosService.getAll()
      .then(data => setCategorias(Array.isArray(data) ? data : []))
      .catch(() => setCategorias([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (d) => { const r = await categoriasInsumosService.create(d); refresh(); return r; }, [refresh]);
  const update = useCallback(async (id, d) => { const r = await categoriasInsumosService.update(id, d); refresh(); return r; }, [refresh]);
  const remove = useCallback(async (id) => { const r = await categoriasInsumosService.remove(id); refresh(); return r; }, [refresh]);
  const toggleEstado = useCallback(async (id) => { const r = await categoriasInsumosService.toggleEstado(id); refresh(); return r; }, [refresh]);
  const recategorizar = useCallback(async (id, data) => { const r = await categoriasInsumosService.recategorizar(id, data); refresh(); return r; }, [refresh]);

  return { categorias, loading, refresh, create, update, remove, toggleEstado, recategorizar };
};

export default useCategoriasInsumos;
