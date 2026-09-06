import { useState, useCallback, useEffect } from 'react';
import productosService from '../services/productosService';

const useProductos = () => {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    productosService.getAll()
      .then(data => setProductos(Array.isArray(data) ? data : []))
      .catch(() => setProductos([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (d) => { const r = await productosService.create(d); refresh(); return r; }, [refresh]);
  const update = useCallback(async (id, d) => { const r = await productosService.update(id, d); refresh(); return r; }, [refresh]);
  const remove = useCallback(async (id) => { const r = await productosService.remove(id); refresh(); return r; }, [refresh]);
  const getById = useCallback((id) => productosService.getById(id), []);

  return { productos, loading, refresh, create, update, remove, getById };
};

export default useProductos;