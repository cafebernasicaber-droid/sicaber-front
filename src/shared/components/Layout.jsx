// ─────────────────────────────────────────────────────────────
//  src/shared/components/Layout.jsx
//  REEMPLAZA el archivo existente — versión con scroll fix definitivo
//
//  CAUSA RAÍZ DEL BUG (Layout original):
//    useLayoutEffect corre SINCRÓNICAMENTE antes del paint del DOM.
//    En ese momento React ya desmontó/remontó el nav,
//    por lo que navRef.current.scrollTop es 0 aunque guardamos el valor.
//    El navegador lo resetea después de que useLayoutEffect corre.
//
//  SOLUCIÓN:
//    1. Escuchar el evento 'scroll' nativo del nav para guardar
//       la posición en tiempo real (no solo al hacer click).
//    2. Restaurar con requestAnimationFrame, que corre DESPUÉS
//       de que el navegador termina de pintar — garantiza que
//       el DOM está listo y el scroll se aplica correctamente.
//    3. Eliminar useLayoutEffect del scroll del nav.
//
//  FIX ADICIONAL — sidebar expandido se "cerraba solo" al navegar:
//    Cada página (InsumosPage, ComprasPage, etc.) envuelve su PROPIO
//    <Layout>, en vez de que exista un único <Layout> persistente por
//    encima del enrutador. Eso significa que, al cambiar de módulo,
//    React desmonta la instancia vieja de Layout y monta una nueva —
//    y como "expanded" vivía en un useState local (inicializado en
//    false), cada instancia nueva nacía contraída de cero. No es que
//    el sidebar "se cerrara" al hacer click: nunca sobrevivía a la
//    navegación en primer lugar.
//    Solución: persistir la decisión en localStorage, fuera del ciclo
//    de vida del componente — así, aunque Layout se vuelva a montar,
//    el nuevo useState lee el valor guardado en vez de arrancar
//    siempre en false, y el sidebar se queda expandido hasta que el
//    usuario mismo decida contraerlo.
// ─────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import DomiciliosBell from './DomiciliosBell';
import './Layout.css';

const SIDEBAR_EXPANDED_KEY = 'sicaber_sidebar_expanded';

const icons = {
  dashboard:    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>,
  roles:        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  usuarios:     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
  clientes:     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  insumos:      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  proveedores:  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  compras:      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
  pedidos:      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>,
  empleados:    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  productos:    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>,
  categorias:   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  adiciones:    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  combos:       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>,
  toppings:     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12"/><path d="M12 6v6l4 2"/></svg>,
  ventas:       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>,
  devoluciones: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6l6-6"/></svg>,
  fichas:       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  promociones:  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  logout:       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  user:         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  chevronRight: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>,
};

// Autorización por permisos, punto 2 (sidebar dinámico): cada item lleva su
// `modulo` — la misma clave que usa el backend en requierePermiso(modulo,
// accion) y que arma cada id de permiso ('accion_modulo', ver
// rolesService.js MODULOS_PERMISOS). Un item solo se muestra si
// hasAnyPermiso(modulo) es true (al menos un permiso sobre ese módulo);
// ver el filtrado de NAV_GROUPS más abajo, dentro del componente.
// Se exporta para que HomeRedirect (redirección tras login, Tarea 1 punto
// 1d) use EXACTAMENTE el mismo orden y mapeo módulo→ruta que el sidebar —
// sin duplicar la lista en dos sitios. La lógica de permiso sigue siendo
// una sola (hasAnyPermiso), no se copia.
export const NAV_GROUPS = [
  { label: 'Principal', items: [
    { path: '/admin/dashboard', label: 'Dashboard',      icon: icons.dashboard,    modulo: 'dashboard',    match: p => p === '/admin/dashboard' },
  ]},
  { label: 'Configuración', items: [
    { path: '/admin/roles',    label: 'Roles',           icon: icons.roles,        modulo: 'roles',        match: p => p.startsWith('/admin/roles') },
  ]},
  { label: 'Usuarios', items: [
    { path: '/admin/usuarios', label: 'Usuarios',        icon: icons.usuarios,     modulo: 'usuarios',     match: p => p.startsWith('/admin/usuarios') },
    { path: '/empleados',      label: 'Empleados',       icon: icons.empleados,    modulo: 'empleados',    match: p => p.startsWith('/empleados') },
  ]},
  { label: 'Compras', items: [
    { path: '/categorias',     label: 'Categorías',      icon: icons.categorias,   modulo: 'categorias',   match: p => p.startsWith('/categorias') },
    { path: '/proveedores',    label: 'Proveedores',     icon: icons.proveedores,  modulo: 'proveedores',  match: p => p.startsWith('/proveedores') },
    { path: '/insumos',        label: 'Insumos',         icon: icons.insumos,      modulo: 'insumos',      match: p => p.startsWith('/insumos') },
    { path: '/compras',        label: 'Compras',         icon: icons.compras,      modulo: 'compras',      match: p => p.startsWith('/compras') },
  ]},
  { label: 'Producción / Menú', items: [
    { path: '/productos',      label: 'Productos',       icon: icons.productos,    modulo: 'productos',    match: p => p.startsWith('/productos') },
    { path: '/fichas-tecnicas',label: 'Fichas técnicas', icon: icons.fichas,       modulo: 'fichas',       match: p => p.startsWith('/fichas-tecnicas') },
    { path: '/adiciones',      label: 'Adiciones',       icon: icons.adiciones,    modulo: 'adiciones',    match: p => p.startsWith('/adiciones') },
    { path: '/combos',         label: 'Combos',          icon: icons.combos,       modulo: 'combos',       match: p => p.startsWith('/combos') },
    { path: '/toppings',       label: 'Toppings',        icon: icons.toppings,     modulo: 'toppings',     match: p => p.startsWith('/toppings') },
  ]},
  { label: 'Ventas', items: [
    { path: '/admin/clientes', label: 'Clientes',        icon: icons.clientes,     modulo: 'clientes',     match: p => p.startsWith('/admin/clientes') },
    { path: '/pedidos',        label: 'Pedidos',         icon: icons.pedidos,      modulo: 'pedidos',      match: p => p.startsWith('/pedidos') },
    { path: '/ventas',         label: 'Ventas',          icon: icons.ventas,       modulo: 'ventas',       match: p => p.startsWith('/ventas') },
    { path: '/devoluciones',   label: 'Devoluciones',    icon: icons.devoluciones, modulo: 'devoluciones', match: p => p.startsWith('/devoluciones') },
  ]},
];

const Layout = ({ children }) => {
  const { user, logout, hasAnyPermiso } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate         = useNavigate();
  const location         = useLocation();
  const [showLogout, setShowLogout] = useState(false);

  // Autorización por permisos, punto 2: filtra NAV_GROUPS en cada render
  // según los permisos REALES del usuario logueado — un módulo solo
  // aparece si tiene al menos un permiso sobre él (ver/crear/editar/...).
  // Grupos que se quedan sin ningún item visible se ocultan enteros (un
  // encabezado de sección vacío no aporta nada).
  const visibleGroups = NAV_GROUPS
    .map(group => ({ ...group, items: group.items.filter(item => hasAnyPermiso(item.modulo)) }))
    .filter(group => group.items.length > 0);
  // Modo compacto: un solo riel de iconos, sin agrupar por sección (los
  // encabezados de grupo no tienen sentido sin texto). Se deriva de los
  // grupos ya filtrados, para no mostrar en el riel compacto nada que el
  // modo expandido tampoco mostraría.
  const flatItems = visibleGroups.flatMap(g => g.items);
  // Sidebar inteligente: contraído (solo iconos) o expandido (iconos +
  // nombres + submenús), decisión que persiste en localStorage — NO en un
  // useState "limpio" — porque cada página envuelve su propio <Layout>
  // (ver InsumosPage.jsx, ComprasPage.jsx, etc.), así que React desmonta
  // y vuelve a montar esta instancia en cada cambio de módulo. Sin esta
  // persistencia, el estado "expanded" nacería en false cada vez,
  // dando la sensación de que el sidebar "se cierra solo" al navegar. En
  // modo contraído, pasar el cursor sobre un icono muestra solo el
  // nombre de ese módulo — nunca expande todo el sidebar. El tooltip se
  // posiciona con `fixed` (no CSS puro) para que nunca quede recortado
  // por el scroll/overflow del nav.
  const [expanded, setExpanded] = useState(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_EXPANDED_KEY);
      // Si nunca se ha tocado (primera visita, o localStorage limpio), el
      // sidebar arranca expandido por defecto — solo se contrae si el
      // usuario mismo lo eligió alguna vez.
      return stored === null ? true : stored === '1';
    }
    catch { return true; }
  });
  const toggleExpanded = () => {
    setExpanded(prev => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_EXPANDED_KEY, next ? '1' : '0'); }
      catch { /* localStorage no disponible — el toggle sigue funcionando en esta sesión */ }
      return next;
    });
  };
  const [hoverTip, setHoverTip] = useState(null); // { label, top } | null
  const showTip = (e, label) => {
    if (expanded) return;
    const r = e.currentTarget.getBoundingClientRect();
    setHoverTip({ label, top: r.top + r.height / 2 });
  };
  const hideTip = () => setHoverTip(null);
  // Acordeón: inicializa con el grupo activo abierto
  const initOpen = () => {
    const open = {};
    visibleGroups.forEach(g => {
      if (g.items.some(i => i.match(window.location.pathname))) open[g.label] = true;
    });
    // Si ninguno activo, abrir todos por defecto
    if (Object.keys(open).length === 0) visibleGroups.forEach(g => { open[g.label] = true; });
    return open;
  };
  const [openGroups, setOpenGroups] = useState(initOpen);
  const toggleGroup = (label) => setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));

  const contentRef     = useRef(null);
  const navRef         = useRef(null);
  // Ref que guarda la posición del scroll del nav en tiempo real
  const savedNavScroll = useRef(0);

  // ── FIX SCROLLBAR ──────────────────────────────────────────
  // 1. Escuchar el evento 'scroll' nativo del nav.
  //    Esto actualiza savedNavScroll.current en tiempo real,
  //    independientemente de cómo se navegue (click, redirect, etc.)
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const onScroll = () => { savedNavScroll.current = el.scrollTop; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []); // solo al montar — el listener persiste toda la sesión

  // 2. Al cambiar de ruta:
  //    a) Subir el contenido principal al top
  //    b) Restaurar el scroll del nav con rAF (después del paint)
  useEffect(() => {
    // Subir el contenido principal
    if (contentRef.current) contentRef.current.scrollTop = 0;

    // Restaurar nav scroll — rAF garantiza que el DOM ya fue pintado
    const saved = savedNavScroll.current;
    if (!saved) return; // si era 0, no hacer nada
    const frame = requestAnimationFrame(() => {
      if (navRef.current) navRef.current.scrollTop = saved;
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname]);
  // ───────────────────────────────────────────────────────────

  const handleLogout  = () => { logout(); navigate('/login'); };
  const handleNavClick = useCallback((path) => { navigate(path); }, [navigate]);

  return (
    <div className="layout-root">
      <aside className={`sidebar ${expanded ? 'sidebar--expanded' : 'sidebar--compact'}`}>
        <div className="sidebar-logo">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => { toggleExpanded(); hideTip(); }}
            title={expanded ? 'Contraer menú' : 'Expandir menú'}
          >
            <span style={{transform: expanded ? 'rotate(180deg)' : 'none', display:'flex'}}>{icons.chevronRight}</span>
          </button>
          <div className="sidebar-logo-circle">
            <img src="/img/Logotipo_blanco.png" alt="Sicaber" style={{width:44,height:44,objectFit:'contain',filter:'none',padding:4}}/>
          </div>
          <span className="sidebar-brand">SICABER</span>
          <span className="sidebar-tagline">Sistema de Gestión</span>
        </div>

        <nav className="sidebar-nav" ref={navRef}>
          {expanded ? (
            visibleGroups.map(group => (
              <div className="sidebar-group" key={group.label}>
                <button
                  className="sidebar-group-label sidebar-group-toggle"
                  onClick={() => toggleGroup(group.label)}
                  style={{width:'100%',textAlign:'left',background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px 4px'}}
                >
                  <span>{group.label}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{transition:'transform .25s',transform:openGroups[group.label]?'rotate(180deg)':'rotate(0deg)',opacity:.5}}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {openGroups[group.label] && group.items.map(item => (
                  <button
                    key={item.path}
                    className={`sidebar-nav-item ${item.match(location.pathname) ? 'active' : ''}`}
                    onClick={() => handleNavClick(item.path)}
                  >
                    {item.icon}<span className="sidebar-nav-item__label">{item.label}</span>
                  </button>
                ))}
              </div>
            ))
          ) : (
            // Modo contraído: un solo riel de iconos (sin agrupar), con
            // tooltip flotante al pasar el cursor — nunca expande el sidebar.
            flatItems.map(item => (
              <button
                key={item.path}
                className={`sidebar-nav-item ${item.match(location.pathname) ? 'active' : ''}`}
                onClick={() => handleNavClick(item.path)}
                onMouseEnter={e => showTip(e, item.label)}
                onMouseLeave={hideTip}
              >
                {item.icon}
              </button>
            ))
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{user?.username?.charAt(0)?.toUpperCase()}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-username">{user?.username}</span>
              <span className="sidebar-role">{user?.role || 'Administrador'}</span>
            </div>
          </div>
          <button className="btn-logout" title="Salir" onClick={() => setShowLogout(true)}>
            {icons.logout} <span className="sidebar-nav-item__label">Salir</span>
          </button>
        </div>
      </aside>

      {hoverTip && !expanded && (
        <div className="sidebar-hover-tip" style={{ top: hoverTip.top }}>{hoverTip.label}</div>
      )}

      <main className="layout-main">
        <header className="topbar">
          <div className="topbar-right">
            <DomiciliosBell />
            <button
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              aria-label="Cambiar tema"
            >
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
            <div className="topbar-user">{icons.user}<span>{user?.username}</span></div>
          </div>
        </header>
        <div className="layout-content" ref={contentRef}>{children}</div>
      </main>

      {showLogout && (
        <div className="modal-overlay" onClick={() => setShowLogout(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-icon modal-icon-warn">{icons.logout}</div>
            <h3>¿Cerrar sesión?</h3>
            <p>¿Estás seguro de que deseas salir del sistema?</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowLogout(false)}>Cancelar</button>
              <button className="btn-confirm-danger" onClick={handleLogout}>Sí, salir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;