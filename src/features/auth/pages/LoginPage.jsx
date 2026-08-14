import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { useTheme } from '../../../shared/contexts/ThemeContext';
import './LoginPage.css';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSubmit = async e => {
  e.preventDefault(); setError('');
  if (!username || !password) { setError('Completa todos los campos'); return; }
  setLoading(true);
  const r = await login(username, password);
  if (r.success) navigate(r.redirectTo || '/admin/dashboard');
  else { setError(r.error); setLoading(false); }
};

  return (
    <div className="adm-login">
      {/* LEFT PANEL */}
      <div className="adm-left">
        <div className="adm-left__bg"/>
        <div className="adm-left__content">
          <div className="adm-left__logo">
            <div className="adm-left__logo-ring">
              <svg width="54" height="54" viewBox="0 0 80 80" fill="none">
                <circle cx="40" cy="40" r="38" stroke="white" strokeWidth="2.5"/>
                <circle cx="40" cy="40" r="30" stroke="white" strokeWidth="1.5" strokeDasharray="3 3"/>
                <path d="M25 30 Q25 28 27 28 L53 28 Q55 28 55 30 L52 52 Q52 54 50 54 L30 54 Q28 54 28 52 Z" fill="none" stroke="white" strokeWidth="2"/>
                <path d="M55 34 Q62 34 62 40 Q62 46 55 46" stroke="white" strokeWidth="2" fill="none"/>
                <path d="M32 24 Q34 20 36 24" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                <path d="M38 22 Q40 18 42 22" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                <path d="M44 24 Q46 20 48 24" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="adm-left__brand">SICABER</div>
              <div className="adm-left__tagline">Sistema de Gestión</div>
            </div>
          </div>
          <h1 className="adm-left__title">Panel<br/><em>Administrativo</em></h1>
          <p className="adm-left__sub">Gestiona tu negocio de cafés, preentrenos y más desde un solo lugar.</p>
          <div className="adm-left__feats">
            {['Roles y permisos granulares','Gestión de usuarios y clientes','Control de insumos e inventario','Compras a proveedores','Pedidos en tiempo real'].map((f,i) => (
              <div className="adm-left__feat" key={i}>
                <div className="adm-left__feat-dot"/>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="adm-left__orb adm-left__orb--1"/>
        <div className="adm-left__orb adm-left__orb--2"/>
        <div className="adm-left__orb adm-left__orb--3"/>
      </div>

      {/* RIGHT PANEL */}
      <div className="adm-right">
        <button
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          style={{ position:'absolute', top:20, right:20, zIndex:10 }}
        >
          {theme === 'dark' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
        <div className="adm-card">
          <div className="adm-card__head">
            <h2 className="adm-card__title">Iniciar sesión</h2>
            <p className="adm-card__sub">Accede con tus credenciales de administrador</p>
          </div>

          {error && (
            <div className="adm-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="adm-form">
            <div className="adm-field">
              <label>Usuario o correo electrónico</label>
              <div className="adm-input-wrap">
                <svg className="adm-input-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <input type="text" placeholder="Usuario o correo" autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)}/>
              </div>
            </div>
            <div className="adm-field">
              <label>Contraseña</label>
              <div className="adm-input-wrap">
                <svg className="adm-input-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <input type={showPass?'text':'password'} placeholder="Tu contraseña" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/>
                <button type="button" className="adm-eye" onClick={() => setShowPass(!showPass)}>
                  {showPass
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            <button type="submit" className="adm-submit" disabled={loading}>
              {loading ? (
                <><span className="adm-spinner"/><span>Ingresando...</span></>
              ) : (
                <><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg><span>Acceder al panel</span></>
              )}
            </button>
          </form>

          <Link to="/" className="adm-back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Volver al sitio
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;