import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './shared/components/PrivateRoute';
import AccesoNoAutorizado from './shared/components/AccesoNoAutorizado';
import HomeRedirect from './shared/components/HomeRedirect';

import Landing from './landing/Landing';
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

// Autorización por permisos, punto 3: PR ahora acepta `modulo` (+ `accion`,
// 'ver' por defecto) y se los pasa a PrivateRoute, que redirige a
// /acceso-no-autorizado si el usuario no tiene ese permiso — antes PR
// siempre pasaba de largo sin `modulo`, así que CUALQUIER usuario logueado
// podía entrar a CUALQUIER ruta del panel admin sin importar su rol.
// Las rutas sin `modulo` (Cajero/Bartender, y las públicas) siguen
// funcionando igual que antes: solo exigen sesión iniciada.
const PR = ({ children, modulo, accion }) => <PrivateRoute modulo={modulo} accion={accion}>{children}</PrivateRoute>;

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Landing />} />
    {/* /mis-pedidos se eliminó: el historial es ahora una sección del
        modal de cuenta en la Landing (Mi perfil / Historial / Editar). */}
    <Route path="/login" element={<Navigate to="/" replace />} />
    <Route path="/acceso-no-autorizado" element={<AccesoNoAutorizado />} />

    {/* ── Panel Admin ── */}
    <Route path="/admin/dashboard"           element={<PR modulo="dashboard"><DashboardPage /></PR>} />
    <Route path="/admin/roles"               element={<PR modulo="roles"><RolesPage /></PR>} />
    <Route path="/admin/roles/nuevo"         element={<PR modulo="roles" accion="crear"><AgregarRolPage /></PR>} />
    <Route path="/admin/roles/editar/:id"    element={<PR modulo="roles" accion="editar"><EditarRolPage /></PR>} />
    <Route path="/admin/roles/ver/:id"       element={<PR modulo="roles"><VerRolPage /></PR>} />
    <Route path="/admin/usuarios"            element={<PR modulo="usuarios"><UsuariosPage /></PR>} />
    <Route path="/admin/usuarios/nuevo"      element={<PR modulo="usuarios" accion="crear"><AgregarUsuarioPage /></PR>} />
    <Route path="/admin/usuarios/editar/:id" element={<PR modulo="usuarios" accion="editar"><EditarUsuarioPage /></PR>} />
    <Route path="/admin/usuarios/ver/:id"    element={<PR modulo="usuarios"><VerUsuarioPage /></PR>} />
    <Route path="/admin/clientes"            element={<PR modulo="clientes"><ClientesPage /></PR>} />
    <Route path="/admin/clientes/ver/:id"    element={<PR modulo="clientes"><VerClientePage /></PR>} />

    <Route path="/pedidos"         element={<PR modulo="pedidos"><PedidosPage /></PR>} />
    <Route path="/empleados"       element={<PR modulo="empleados"><EmpleadosPage /></PR>} />
    <Route path="/ventas"          element={<PR modulo="ventas"><VentasPage /></PR>} />
    <Route path="/devoluciones"    element={<PR modulo="devoluciones"><DevolucionesPage /></PR>} />
    <Route path="/fichas-tecnicas" element={<PR modulo="fichas"><FichasTecnicasPage /></PR>} />

    <Route path="/productos"            element={<PR modulo="productos"><ProductosPage /></PR>} />
    <Route path="/productos/nuevo"      element={<PR modulo="productos" accion="crear"><ProductoFormPage /></PR>} />
    <Route path="/productos/editar/:id" element={<PR modulo="productos" accion="editar"><ProductoFormPage /></PR>} />
    <Route path="/categorias"           element={<PR modulo="categorias"><CategoriasPage /></PR>} />
    <Route path="/adiciones"            element={<PR modulo="adiciones"><AdicionesPage /></PR>} />
    <Route path="/combos"               element={<PR modulo="combos"><CombosPage /></PR>} />
    <Route path="/toppings"             element={<PR modulo="toppings"><ToppingsPage /></PR>} />

    <Route path="/insumos"            element={<PR modulo="insumos"><InsumosPage /></PR>} />

    <Route path="/proveedores"            element={<PR modulo="proveedores"><ProveedoresPage /></PR>} />

    <Route path="/compras"             element={<PR modulo="compras"><ComprasPage /></PR>} />
    <Route path="/compras/historial"   element={<PR modulo="compras"><HistorialComprasPage /></PR>} />

    {/* ── Cajero ── */}
    <Route path="/cajero"    element={<PR><CajeroPage /></PR>} />

    {/* ── Bartender ── */}
    <Route path="/bartender" element={<PR><BartenderPage /></PR>} />

    <Route path="/verificar-cuenta"   element={<VerificarCuentaPage />} />
    <Route path="/recuperar-password" element={<RecuperarPasswordPage />} />

    {/* Tarea 1, punto 1d: /admin ya NO redirige fijo a Dashboard — lleva al
        primer módulo con permiso (ver HomeRedirect). login() apunta acá. */}
    <Route path="/admin" element={<PR><HomeRedirect /></PR>} />
    <Route path="*"      element={<Navigate to="/" replace />} />
  </Routes>
);

export default AppRoutes; 