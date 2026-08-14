import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AuthPage.css';
const API = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

export default function RecuperarPasswordPage() {
  const navigate = useNavigate();
  const [step,          setStep]    = useState(1); // 1=correo, 2=token+nueva pass
  const [correo,        setCorreo]  = useState('');
  const [token,         setToken]   = useState('');
  const [nuevaPass,     setNueva]   = useState('');
  const [confirmar,     setConfirm] = useState('');
  const [error,         setError]   = useState('');
  const [loading,       setLoading] = useState(false);
  const [ok,            setOk]      = useState(false);

  const handleSolicitar = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res  = await fetch(`${API}/auth/cliente/recuperar`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ correo }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setLoading(false); return; }
      setStep(2); setLoading(false);
    } catch { setError('Error de conexión'); setLoading(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault(); setError('');
    if (nuevaPass !== confirmar) { setError('Las contraseñas no coinciden'); return; }
    if (nuevaPass.length < 6)    { setError('Mínimo 6 caracteres'); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API}/auth/cliente/reset-password`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ correo, token, nuevaPassword: nuevaPass }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setLoading(false); return; }
      setOk(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch { setError('Error de conexión'); setLoading(false); }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-logo">🔐</div>
        <h2 className="auth-title">Recuperar contraseña</h2>

        {ok ? (
          <div className="auth-success">✅ Contraseña actualizada. Redirigiendo al login...</div>
        ) : step === 1 ? (
          <form onSubmit={handleSolicitar}>
            <p className="auth-sub">Ingresa tu correo y te enviaremos un código de recuperación.</p>
            <div className="auth-field">
              <label>Correo electrónico</label>
              <input type="email" value={correo} onChange={e=>setCorreo(e.target.value)} required placeholder="tu@correo.com"/>
            </div>
            {error && <div className="auth-error">⚠ {error}</div>}
            <button className="auth-btn" type="submit" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar código'}
            </button>
            <p className="auth-link" onClick={()=>navigate('/login')} style={{cursor:'pointer'}}>← Volver al login</p>
          </form>
        ) : (
          <form onSubmit={handleReset}>
            <p className="auth-sub">Ingresa el código enviado a <strong>{correo}</strong> y tu nueva contraseña.</p>
            <div className="auth-field">
              <label>Código de verificación</label>
              <input type="text" maxLength={6} value={token}
                onChange={e=>setToken(e.target.value.replace(/\D/g,''))}
                placeholder="123456" required
                style={{fontSize:28,letterSpacing:8,textAlign:'center',fontWeight:'bold'}}/>
            </div>
            <div className="auth-field">
              <label>Nueva contraseña</label>
              <input type="password" value={nuevaPass} onChange={e=>setNueva(e.target.value)} required placeholder="Mínimo 6 caracteres"/>
            </div>
            <div className="auth-field">
              <label>Confirmar contraseña</label>
              <input type="password" value={confirmar} onChange={e=>setConfirm(e.target.value)} required placeholder="Repite la contraseña"/>
            </div>
            {error && <div className="auth-error">⚠ {error}</div>}
            <button className="auth-btn" type="submit" disabled={loading}>
              {loading ? 'Guardando...' : 'Cambiar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}