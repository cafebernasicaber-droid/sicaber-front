import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTransition } from '../../../shared/contexts/TransitionContext';
import { setToken } from '../../../shared/services/api';
import './AuthPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

export default function VerificarCuentaPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { playTransition } = useTransition();
  const correoInicial = location.state?.correo || '';

  const [correo, setCorreo] = useState(correoInicial);
  const [token,  setToken]  = useState('');
  const [error,  setError]  = useState('');
  const [loading,setLoading]= useState(false);
  const [ok,     setOk]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!correo.trim()) { setError('El correo es obligatorio.'); return; }
    if (!/\S+@\S+\.\S+/.test(correo)) { setError('Ingresa un correo electrónico válido.'); return; }
    if (!token.trim()) { setError('Ingresa el código de verificación.'); return; }
    if (token.length !== 6) { setError('El código debe tener 6 dígitos.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/cliente/verificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, token }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Código inválido'); setLoading(false); return; }
      // Antes: se guardaba en localStorage['token_cliente'], una clave que
      // ningún otro módulo lee — api.js usa 'sicaber_token' (getToken/
      // setToken) y Landing.jsx lee la sesión de cliente desde
      // 'sicaber_cliente_session'. Como resultado, tras verificar la cuenta
      // el cliente quedaba con un token guardado en el lugar equivocado:
      // llegaba a "/" como si no hubiera iniciado sesión, y cualquier
      // acción autenticada fallaba con 401. Se usa aquí el mismo mecanismo
      // que ya usa el login normal (Landing.jsx `handleLogin`).
      setToken(data.token);
      const session = { id: data.cliente.id, nombre: data.cliente.nombre, correo: data.cliente.correo };
      localStorage.setItem('sicaber_cliente_session', JSON.stringify(session));
      setLoading(false);
      setOk(true);
      // La cortina de transición cubre la pantalla y, ya cubierta, navega a "/".
      // Así el cambio de página se ve como una transición difuminada y no como
      // un salto brusco al landing.
      playTransition(() => navigate('/'), { message: '¡Cuenta verificada!' });
    } catch { setError('Error de conexión'); setLoading(false); }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-logo">☕</div>
        <h2 className="auth-title">Verifica tu cuenta</h2>
        <p className="auth-sub">Ingresa el código de 6 dígitos que enviamos a <strong>{correo || 'tu correo'}</strong></p>

        {ok ? (
          <div className="auth-success">✅ ¡Cuenta verificada! Redirigiendo...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            {!correoInicial && (
              <div className="auth-field">
                <label>Correo electrónico</label>
                <input type="text" value={correo} onChange={e => setCorreo(e.target.value)} placeholder="tu@correo.com" />
              </div>
            )}
            <div className="auth-field">
              <label>Código de verificación</label>
              <input
                type="text" value={token}
                onChange={e => setToken(e.target.value.replace(/\D/g,'').slice(0, 6))}
                placeholder="123456"
                style={{fontSize:28, letterSpacing:8, textAlign:'center', fontWeight:'bold'}}
              />
            </div>
            {error && <div className="auth-error">⚠ {error}</div>}
            <button className="auth-btn" type="submit" disabled={loading}>
              {loading ? 'Verificando...' : 'Confirmar cuenta'}
            </button>
            <p className="auth-link" onClick={() => navigate('/login')} style={{cursor:'pointer'}}>
              ← Volver al inicio de sesión
            </p>
          </form>
        )}
      </div>
    </div>
  );
}