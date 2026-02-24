import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const C = {
  navy: '#2c3e7e',
  orange: '#f3843e',
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { data, error } = await signIn(email, password);
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Wait for session to be fully established before navigating
      const checkProfile = async (attempts = 0) => {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', data.user.id)
          .single();
        if (prof) {
          navigate('/dashboard');
        } else if (attempts < 10) {
          setTimeout(() => checkProfile(attempts + 1), 200);
        } else {
          setError('Profile not found. Please contact your administrator.');
          setLoading(false);
        }
      };
      checkProfile();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg" style={{ background: C.orange }}>TT</div>
            <span className="text-3xl font-bold" style={{ color: C.navy }}>TimeTrak</span>
          </div>
          <p className="text-gray-500 text-sm">ScholarPath Systems</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-bold mb-6" style={{ color: C.navy }}>Sign In</h2>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                placeholder="you@school.org"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-white font-semibold text-sm shadow-sm hover:shadow-md transition-all disabled:opacity-50"
              style={{ background: C.navy }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">© 2026 ScholarPath Systems</p>
      </div>
    </div>
  );
}