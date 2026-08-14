import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './shared/components/PrivateRoute';

import Landing from './landing/Landing';
import MisPedidosPage from './landing/MisPedidosPage';
import DashboardPage from './features/dashboard/pages/DashboardPage';

import RolesPage from './features/roles/pages/RolesPage';
import { AgregarRolPage, EditarRolPage } from './features/roles/pages/RolFormPage';
import VerRolPage from './features/roles/pages/VerRolPage';

import UsuariosPage from './features/usuarios/pages/UsuariosPage';
import { AgregarUsuarioPage, EditarUsuarioPage } from './features/usuarios/pages/UsuarioFormPage';
import VerUsuarioPage from './features/usuarios/pages/VerUsuarioPage';

import ClientesPage from './features/clientes/pages/ClientesPage';
import { VerClientePage } from './features/clientes/pages/ClienteFormPages';

import InsumosPage from './features/insumos/pages/InsumosPage';

import ProveedoresPage from './features/proveedores/pages/ProveedoresPage';

import ComprasPage from './features/compras/pages/ComprasPage';
import HistorialComprasPage from './features/compras/pages/HistorialComprasPage';

import PedidosPage from './features/pedidos/pages/PedidosPage';
import EmpleadosPage from './features/empleados/pages/EmpleadosPage';

import ProductosPage from './features/productos/pages/ProductosPage';
import ProductoFormPage from './features/productos/pages/ProductoFormPage';
import CategoriasPage from './features/categorias/pages/CategoriasPage';
import AdicionesPage from './features/adiciones/pages/AdicionesPage';
import CombosPage from './features/combos/pages/CombosPage';
import ToppingsPage from './features/toppings/pages/ToppingsPage';

import VentasPage from './features/ventas/pages/VentasPage';
import DevolucionesPage from './features/devoluciones/pages/DevolucionesPage';
import FichasTecnicasPage from './features/fichasTecnicas/pages/FichasTecnicasPage';

import CajeroPage    from './features/cajero/pages/CajeroPage';
import VerificarCuentaPage   from './features/auth/pages/VerificarCuentaPage';
import RecuperarPasswordPage from './features/auth/pages/RecuperarPasswordPage';
import BartenderPage from './features/bartender/pages/BartenderPage';

const PR = ({ children }) => <PrivateRoute>{children}</PrivateRoute>;

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/mis-pedidos" element={<MisPedidosPage />} />
    <Route path="/login" element={<Navigate to="/" replace />} />

    {/* ── Panel Admin ── */}
    <Route path="/admin/dashboard"           element={<PR><DashboardPage /></PR>} />
    <Route path="/admin/roles"               element={<PR><RolesPage /></PR>} />
    <Route path="/admin/roles/nuevo"         element={<PR><AgregarRolPage /></PR>} />
    <Route path="/admin/roles/editar/:id"    element={<PR><EditarRolPage /></PR>} />
    <Route path="/admin/roles/ver/:id"       element={<PR><VerRolPage /></PR>} />
    <Route path="/admin/usuarios"            element={<PR><UsuariosPage /></PR>} />
    <Route path="/admin/usuarios/nuevo"      element={<PR><AgregarUsuarioPage /></PR>} />
    <Route path="/admin/usuarios/editar/:id" element={<PR><EditarUsuarioPage /></PR>} />
    <Route path="/admin/usuarios/ver/:id"    element={<PR><VerUsuarioPage /></PR>} />
    <Route path="/admin/clientes"            element={<PR><ClientesPage /></PR>} />
    <Route path="/admin/clientes/ver/:id"    element={<PR><VerClientePage /></PR>} />

    <Route path="/pedidos"         element={<PR><PedidosPage /></PR>} />
    <Route path="/empleados"       element={<PR><EmpleadosPage /></PR>} />
    <Route path="/ventas"          element={<PR><VentasPage /></PR>} />
    <Route path="/devoluciones"    element={<PR><DevolucionesPage /></PR>} />
    <Route path="/fichas-tecnicas" element={<PR><FichasTecnicasPage /></PR>} />

    <Route path="/productos"            element={<PR><ProductosPage /></PR>} />
    <Route path="/productos/nuevo"      element={<PR><ProductoFormPage /></PR>} />
    <Route path="/productos/editar/:id" element={<PR><ProductoFormPage /></PR>} />
    <Route path="/categorias"           element={<PR><CategoriasPage /></PR>} />
    <Route path="/adiciones"            element={<PR><AdicionesPage /></PR>} />
    <Route path="/combos"               element={<PR><CombosPage /></PR>} />
    <Route path="/toppings"             element={<PR><ToppingsPage /></PR>} />

    <Route path="/insumos"            element={<PR><InsumosPage /></PR>} />

    <Route path="/proveedores"            element={<PR><ProveedoresPage /></PR>} />

    <Route path="/compras"             element={<PR><ComprasPage /></PR>} />
    <Route path="/compras/historial"   element={<PR><HistorialComprasPage /></PR>} />

    {/* ── Cajero ── */}
    <Route path="/cajero"    element={<PR><CajeroPage /></PR>} />

    {/* ── Bartender ── */}
    <Route path="/bartender" element={<PR><BartenderPage /></PR>} />

    <Route path="/verificar-cuenta"   element={<VerificarCuentaPage />} />
    <Route path="/recuperar-password" element={<RecuperarPasswordPage />} />

    <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
    <Route path="*"      element={<Navigate to="/" replace />} />
  </Routes>
);

export default AppRoutes; 