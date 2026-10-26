import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

type Mode = 'checking' | 'sandbox' | 'live' | 'unavailable';
const ServiceModeContext = createContext({ sandbox: false, ready: false });
export const useServiceMode = () => useContext(ServiceModeContext);

export function ServiceModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('checking');
  useEffect(() => {
    const controller = new AbortController();
    const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').trim().replace(/\/$/, '');
    void fetch(`${base}/health`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Service unavailable');
        const status = await response.json();
        if (status.status !== 'healthy') throw new Error('Service unavailable');
        if (!controller.signal.aborted) setMode(status.demo === true || status.payment_mode === 'test'
          ? 'sandbox' : status.payment_mode === 'live' ? 'live' : 'unavailable');
      }).catch(() => { if (!controller.signal.aborted) setMode('unavailable'); });
    return () => controller.abort();
  }, []);
  return <ServiceModeContext.Provider value={{ sandbox: mode === 'sandbox', ready: mode === 'sandbox' || mode === 'live' }}>
    {mode !== 'live' && <aside role="note" style={{ background: '#fff4d6', color: '#5c3a00', borderBottom: '1px solid #e6c67c', padding: '12px 20px', textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
      {mode === 'sandbox' ? <><strong>TenTrust Sandbox demo</strong> · Paystack test payments · Mono sample identity data. Use test details only. No live verification or real payment.</>
        : mode === 'checking' ? 'Checking verification service mode…'
        : 'Verification service mode could not be confirmed. Refresh before starting a check.'}
    </aside>}
    {children}
  </ServiceModeContext.Provider>;
}
