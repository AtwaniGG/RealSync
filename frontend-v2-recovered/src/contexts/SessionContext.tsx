import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { authFetch } from '../lib/api';

type MeetingType = 'official' | 'business' | 'friends';

interface ActiveSession {
  sessionId: string;
  title: string;
  meetingType: MeetingType;
}

interface SessionContextType {
  supabaseSession: Session | null;
  loadingAuth: boolean;
  activeSession: ActiveSession | null;
  setActiveSession: (s: ActiveSession | null) => void;
  handleSignOut: () => Promise<void>;
  handleStartSession: (sessionId: string, title: string, meetingType: MeetingType) => void;
  handleEndSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const activeSessionRef = useRef(activeSession);
  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);

  const prototypeModeEnabled =
    import.meta.env.VITE_PROTOTYPE_MODE === '1' ||
    !import.meta.env.VITE_SUPABASE_URL ||
    !import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    if (prototypeModeEnabled) {
      setLoadingAuth(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) setSupabaseSession(data.session ?? null);
    }).finally(() => {
      if (isMounted) setLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) setSupabaseSession(session ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [prototypeModeEnabled]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    setActiveSession(null);
  }, []);

  const handleStartSession = useCallback((sessionId: string, title: string, meetingType: MeetingType) => {
    setActiveSession({ sessionId, title, meetingType });
  }, []);

  const handleEndSession = useCallback(async () => {
    const current = activeSessionRef.current;
    if (current) {
      try {
        await authFetch(`/api/sessions/${current.sessionId}/stop`, { method: 'POST' });
      } catch {
        // Best-effort
      }
    }
    setActiveSession(null);
  }, []);

  return (
    <SessionContext.Provider value={{
      supabaseSession,
      loadingAuth,
      activeSession,
      setActiveSession,
      handleSignOut,
      handleStartSession,
      handleEndSession,
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSessionContext must be used within SessionProvider');
  return context;
}
