import { useState, useCallback, useEffect } from 'react';
import usuariosService from '../services/usuariosService';

const useUsuarios = () => {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    usuariosService.getAll()
      .then(data => setUsuarios(Array.isArray(data) ? data : []))
      .catch(() => setUsuarios([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (d) => { const r = await usuariosService.create(d); refresh(); return r; }, [refresh]);
  const update = useCallback(async (id, d) => { const r = await usuariosService.update(id, d); refresh(); return r; }, [refresh]);
  const remove = useCallback(async (id) => { const r = await usuariosService.remove(id); refresh(); return r; }, [refresh]);
  const getById = useCallback((id) => usuariosService.getById(id), []);
  const toggleEstado = useCallback(async (id) => { await usuariosService.toggleEstado(id); refresh(); }, [refresh]);

  return { usuarios, loading, refresh, create, update, remove, getById, toggleEstado };
};

export default useUsuarios;