import { useState, useCallback, useEffect } from 'react';
import empleadosService from '../services/empleadosService';

const useEmpleados = () => {
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    empleadosService.getAll()
      .then(data => setEmpleados(Array.isArray(data) ? data : []))
      .catch(() => setEmpleados([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (data) => {
    const r = await empleadosService.create(data);
    refresh();
    return r;
  }, [refresh]);

  const update = useCallback(async (id, data) => {
    const r = await empleadosService.update(id, data);
    refresh();
    return r;
  }, [refresh]);

  const remove = useCallback(async (id) => {
    const r = await empleadosService.remove(id);
    refresh();
    return r;
  }, [refresh]);

  const toggleActivo = useCallback(async (id) => {
    // Usa el service (BASE_URL = http://localhost:4000/api), no fetch relativo
    const r = await empleadosService.toggleEstado(id);
    refresh();
    return r;
  }, [refresh]);

  const getById = useCallback((id) => empleadosService.getById(id), []);

  return { empleados, loading, refresh, create, update, remove, toggleActivo, getById };
};

export default useEmpleados;