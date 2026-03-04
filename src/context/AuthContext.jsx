import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for token handoff from product switcher
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('token');
    const refreshToken = params.get('refresh');

    if (accessToken && refreshToken) {
      // Clean the tokens from the URL immediately
      window.history.replaceState({}, '', window.location.pathname);
      // Set the session using the passed tokens
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data: { session }, error }) => {
          if (session?.user) {
            setUser(session.user);
            fetchProfile(session.user.id);
          } else {
            console.error('Token handoff failed:', error);
            setLoading(false);
          }
        });
      return; // Skip normal getSession flow
    }

    // Normal session init
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (data) {
        setProfile(data);
        setLoading(false);
        return;
      }
      if (i < retries - 1) await new Promise(r => setTimeout(r, 500));
    }
    setLoading(false);
  };

  const signIn = async (email, password) => {
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = async () => {
    setUser(null);
    setProfile(null);
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const isAdmin = profile?.timetrak_role === 'admin';
  const isHR = profile?.timetrak_role === 'hr' || isAdmin;
  const isSupervisor = profile?.timetrak_role === 'supervisor' || isAdmin;
  const isStaff = !!profile;

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signIn, signOut,
      isAdmin, isHR, isSupervisor, isStaff
    }}>
      {children}
    </AuthContext.Provider>
  );
}
