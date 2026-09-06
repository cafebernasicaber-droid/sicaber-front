import { useState, useCallback, useEffect } from 'react';
import proveedoresService from '../services/proveedoresService';

const useProveedores = () => {
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    proveedoresService.getAll()
      .then(data => setProveedores(Array.isArray(data) ? data : []))
      .catch(() => setProveedores([]))
      .finally(() => setLoading(false));
  }, []);

  // Carga inicial
  useEffect(() => { refresh(); }, [refresh]);

  const search = useCallback((query) => {
    const q = query.toLowerCase();
    return proveedores.filter(p =>
      p.nombre?.toLowerCase().includes(q) ||
      p.nit?.toLowerCase().includes(q) ||
      p.correo?.toLowerCase().includes(q) ||
      p.ciudad?.toLowerCase().includes(q)
    );
  }, [proveedores]);

  const create = useCallback(async (data) => {
    setLoading(true);
    try {
      const result = await proveedoresService.create(data);
      await refresh();
      return result;
    } finally { setLoading(false); }
  }, [refresh]);

  const update = useCallback(async (id, data) => {
    setLoading(true);
    try {
      const result = await proveedoresService.update(id, data);
      await refresh();
      return result;
    } finally { setLoading(false); }
  }, [refresh]);

  const remove = useCallback(async (id) => {
    const result = await proveedoresService.remove(id);
    await refresh();
    return result;
  }, [refresh]);

  const getById = useCallback((id) => {
    return proveedoresService.getById(id);
  }, []);

  const toggleEstado = useCallback(async (id) => {
    const result = await proveedoresService.toggleEstado(id);
    await refresh();
    return result;
  }, [refresh]);

  return { proveedores, loading, refresh, search, create, update, remove, getById, toggleEstado };
};

export default useProveedores;