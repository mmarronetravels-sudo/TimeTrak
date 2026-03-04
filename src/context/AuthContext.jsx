import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      // Check for token handoff from product switcher
      const params = new URLSearchParams(window.location.search);
      const accessToken = params.get('token');
      const refreshToken = params.get('refresh');

      if (accessToken && refreshToken) {
        window.history.replaceState({}, '', window.location.pathname);
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (data?.session?.user) {
          setUser(data.session.user);
          await fetchProfile(data.session.user.id);
          return;
        }
        // setSession failed, try refreshSession
        const { data: refreshData } = await supabase.auth.refreshSession({
          refresh_token: refreshToken
        });
        if (refreshData?.session?.user) {
          setUser(refreshData.session.user);
          await fetchProfile(refreshData.session.user.id);
          return;
        }
        // Both failed, go to login
        console.error('Token handoff failed:', error);
        window.location.href = '/login';
        return;
      }

      // Normal session init
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    };

    init();

    // Auth state listener for sign out only
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (_event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      const { data } = await supabase
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
