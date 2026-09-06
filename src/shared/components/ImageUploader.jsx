import React, { useState, useRef } from 'react';
import { uploadToCloudinary, validateImageFile } from '../services/cloudinaryService';

const ImageIcon = ({ size = 32, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);

export default function ImageUploader({ value, onChange, label = 'Imagen del producto' }) {
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [error,     setError]     = useState('');
  const [dragging,  setDragging]  = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = async file => {
    setError('');
    const check = validateImageFile(file);
    if (!check.valid) { setError(check.error); return; }
    setUploading(true); setProgress(0);
    try {
      const url = await uploadToCloudinary(file, pct => setProgress(pct));
      onChange(url);
    } catch (err) {
      setError(err.message || 'Error al subir la imagen. Verifica el upload preset.');
    } finally { setUploading(false); setProgress(0); }
  };

  const onFileChange = e => { if (e.target.files[0]) handleFile(e.target.files[0]); };
  const onDrop       = e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
  const onDragOver   = e => { e.preventDefault(); setDragging(true); };
  const onDragLeave  = ()  => setDragging(false);
  const removeImage  = () => { onChange(''); setError(''); if (fileInputRef.current) fileInputRef.current.value = ''; };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <label style={{ fontSize:13, fontWeight:600, color:'var(--text-secondary)' }}>{label}</label>

      {!value && !uploading && (
        <div
          onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border:`2px dashed ${dragging ? '#5DBB63' : 'var(--border-input)'}`,
            borderRadius:10, padding:'28px 16px', textAlign:'center',
            cursor:'pointer',
            background: dragging ? 'rgba(93,187,99,0.08)' : 'var(--bg-surface-2)',
            transition:'all 0.2s', userSelect:'none',
          }}
        >
          <div style={{ display:'flex', justifyContent:'center', marginBottom:10, color:'var(--text-secondary)' }}>
            <ImageIcon size={36}/>
          </div>
          <p style={{ margin:0, fontSize:13, fontWeight:600, color:'var(--text-secondary)' }}>Arrastra tu imagen aquí</p>
          <p style={{ margin:'3px 0 12px', fontSize:12, color:'var(--text-muted)' }}>o haz clic para seleccionarla</p>
          <span style={{ display:'inline-block', padding:'6px 18px', background:'#4CAF50', color:'white', borderRadius:20, fontSize:12, fontWeight:600, boxShadow:'0 0 12px rgba(93,187,99,0.35)' }}>
            Seleccionar imagen
          </span>
          <p style={{ margin:'10px 0 0', fontSize:11, color:'var(--text-muted)' }}>PNG, JPG, WEBP · Máximo 8 MB</p>
        </div>
      )}

      {uploading && (
        <div style={{ border:'2px dashed #4CAF50', borderRadius:10, padding:'24px 16px', background:'rgba(76,175,80,0.06)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <span style={{ fontSize:13, fontWeight:600, color:'var(--color-green)' }}>Subiendo imagen...</span>
            <span style={{ fontSize:15, fontWeight:800, color:'var(--color-green)' }}>{progress}%</span>
          </div>
          <div style={{ height:8, background:'var(--bg-surface-3)', borderRadius:4, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${progress}%`, background:'linear-gradient(90deg,#4CAF50,#81C784)', borderRadius:4, transition:'width 0.2s ease' }}/>
          </div>
        </div>
      )}

      {value && !uploading && (
        <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
          <div style={{ position:'relative', flexShrink:0 }}>
            <img src={value} alt="preview"
              style={{ width:120, height:120, borderRadius:10, objectFit:'cover', border:'2px solid #4CAF50', display:'block' }}
              onError={e => { e.target.style.display='none'; }}/>
            <button type="button" onClick={removeImage}
              style={{ position:'absolute', top:-8, right:-8, width:24, height:24, borderRadius:'50%', background:'#E53935', border:'none', color:'white', fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 6px rgba(0,0,0,0.2)' }}>×</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, paddingTop:4 }}>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'var(--color-green)', background:'none', border:'1px solid var(--color-green)', borderRadius:6, cursor:'pointer', padding:'6px 12px', fontWeight:600 }}>
              <ImageIcon size={13}/> Cambiar imagen
            </button>
            <p style={{ fontSize:11, color:'var(--text-muted)', margin:0 }}>La nueva imagen se subirá automáticamente</p>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" style={{ display:'none' }} onChange={onFileChange}/>
      {error && <p style={{ margin:'2px 0 0', fontSize:12, color:'#E53935', fontWeight:600 }}>⚠ {error}</p>}
    </div>
  );
}
