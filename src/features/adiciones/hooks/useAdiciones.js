import { useState, useCallback, useEffect } from 'react';
import adicionesService from '../services/adicionesService';

const useAdiciones = () => {
  const [adiciones, setAdiciones] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    adicionesService.getAll()
      .then(data => setAdiciones(Array.isArray(data) ? data : []))
      .catch(() => setAdiciones([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (d) => { const r = await adicionesService.create(d); refresh(); return r; }, [refresh]);
  const update = useCallback(async (id, d) => { const r = await adicionesService.update(id, d); refresh(); return r; }, [refresh]);
  const remove = useCallback(async (id) => { const r = await adicionesService.remove(id); refresh(); return r; }, [refresh]);

  return { adiciones, loading, refresh, create, update, remove };
};

export default useAdiciones;