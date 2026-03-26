import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const C = { navy: '#2c3e7e', orange: '#f3843e' };

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event which fires when the token is exchanged
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });
    // Also check if we already have a session (token already exchanged)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!/[A-Z]/.test(password)) { setError('Password must include at least one uppercase letter'); return; }
    if (!/[a-z]/.test(password)) { setError('Password must include at least one lowercase letter'); return; }
    if (!/[0-9]/.test(password)) { setError('Password must include at least one number'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError('Unable to update password. Please try again or request a new reset link.'); return; }
    setSuccess(true);
    await supabase.auth.signOut();
    setTimeout(() => navigate('/login'), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <h2 className="text-xl font-bold mb-6" style={{ color: C.navy }}>Set New Password</h2>
        {success ? (
          <p className="text-green-600 font-medium">Password updated! Redirecting to login...</p>
        ) : !ready ? (
          <p className="text-gray-500 text-sm">Verifying reset link...</p>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">New Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" required minLength={8} />
              <p className="text-xs text-gray-400 mt-1">At least 8 characters with uppercase, lowercase, and a number</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" required />
            </div>
            <button type="submit" className="w-full py-2.5 rounded-lg text-white font-semibold text-sm"
              style={{ background: C.navy }}>Update Password</button>
          </form>
        )}
      </div>
    </div>
  );
}
