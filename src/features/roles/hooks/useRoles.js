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

  return { roles, loading, refresh, create, update, remove };
};

export default useRoles;  