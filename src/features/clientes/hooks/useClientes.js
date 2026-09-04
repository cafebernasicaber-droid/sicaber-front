import { useState, useCallback, useEffect } from 'react';
import clientesService from '../services/clientesService';

const useClientes = () => {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    clientesService.getAll()
      .then(data => setClientes(Array.isArray(data) ? data : []))
      .catch(() => setClientes([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const update = useCallback(async (id, d) => { const r = await clientesService.update(id, d); refresh(); return r; }, [refresh]);
  const remove = useCallback(async (id) => { const r = await clientesService.remove(id); refresh(); return r; }, [refresh]);
  const getById = useCallback((id) => clientesService.getById(id), []);
  const toggleEstado = useCallback(async (id) => { await clientesService.toggleEstado(id); refresh(); }, [refresh]);

  return { clientes, loading, refresh, update, remove, getById, toggleEstado };
};

export default useClientes;