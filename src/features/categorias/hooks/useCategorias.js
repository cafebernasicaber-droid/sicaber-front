import { useState, useCallback, useEffect } from 'react';
import categoriasService from '../services/categoriasService';

const useCategorias = () => {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    categoriasService.getAll()
      .then(data => setCategorias(Array.isArray(data) ? data : []))
      .catch(() => setCategorias([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (data) => { const r = await categoriasService.create(data); refresh(); return r; }, [refresh]);
  const update = useCallback(async (id, d) => { const r = await categoriasService.update(id, d); refresh(); return r; }, [refresh]);
  const remove = useCallback(async (id) => { const r = await categoriasService.remove(id); refresh(); return r; }, [refresh]);

  return { categorias, loading, refresh, create, update, remove };
};

export default useCategorias; 