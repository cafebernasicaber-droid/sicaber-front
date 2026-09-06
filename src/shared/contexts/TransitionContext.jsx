import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import PageTransitionOverlay from '../components/PageTransitionOverlay';

const TransitionContext = createContext(null);

// Debe coincidir con la duración total de las animaciones en PageTransitionOverlay.css (1.9s)
const TOTAL_DURATION = 1900;
// Momento en que la cortina ya cubrió toda la pantalla (32% de 1.9s) — es seguro
// ejecutar la acción (navegar, cambiar de vista, etc.) sin que el usuario la vea "saltar".
const COVER_DELAY = 650;

export function TransitionProvider({ children }) {
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState('');
  const runIdRef = useRef(0);
  const timeoutsRef = useRef([]);

  const clearPending = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  };

  /**
   * Dispara la transición: cubre la pantalla, ejecuta `action` cuando ya
   * está completamente cubierta (para que el cambio sea invisible) y luego
   * difumina/retira la cortina dejando ver el resultado.
   */
  const playTransition = useCallback((action, opts = {}) => {
    const { message = '', coverDelay = COVER_DELAY, totalDuration = TOTAL_DURATION } = opts;
    clearPending();
    runIdRef.current += 1;
    setLabel(message);
    setActive(true);

    const t1 = setTimeout(() => { if (action) action(); }, coverDelay);
    const t2 = setTimeout(() => setActive(false), totalDuration);
    timeoutsRef.current.push(t1, t2);
  }, []);

  return (
    <TransitionContext.Provider value={{ playTransition }}>
      {children}
      <PageTransitionOverlay active={active} runId={runIdRef.current} label={label} />
    </TransitionContext.Provider>
  );
}

export const useTransition = () => useContext(TransitionContext);