import { useState, useCallback, useEffect } from 'react';
import rolesService from '../services/rolesService';

const useRoles = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    rolesService.getAll()
      .then(data => setRoles(Array.isArray(data) ? data : []))
      .catch(() => setRoles([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (d) => { const r = await rolesService.create(d); refresh(); return r; }, [refresh]);
  const update = useCallback(async (id, d) => { const r = await rolesService.update(id, d); refresh(); return r; }, [refresh]);
  const remove = useCallback(async (id) => { const r = await rolesService.remove(id); refresh(); return r; }, [refresh]);
  // Si el backend rechaza el cambio (ej. 409 al desactivar "Administrador"),
  // rolesService.toggleEstado ya lanza con el mensaje real — se propaga tal
  // cual (sin try/catch acá) para que quien llame lo muestre; `refresh()`
  // solo se alcanza cuando el cambio de verdad se aplicó.
  const toggleEstado = useCallback(async (id) => {
    const r = await rolesService.toggleEstado(id);
    refresh();
    return r;
  }, [refresh]);

  return { roles, loading, refresh, create, update, remove, toggleEstado };
};

export default useRoles;  