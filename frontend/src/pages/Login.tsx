import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Login() {
  const { admin, login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (admin) navigate('/', { replace: true });
  }, [admin, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(identifier, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Is the backend running on port 3000?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-grid-pattern p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-4 mb-10">
          <div className="p-4 rounded-2xl bg-white shadow-elevated border border-navy-200/80">
            <div className="p-3 rounded-xl bg-primary-600 flex items-center justify-center">
              <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="RouterHub" className="w-10 h-10" />
            </div>
          </div>
          <div>
            <h1 className="font-display font-semibold text-display text-navy-900 tracking-tight">RouterHub</h1>
            <p className="text-body text-navy-500 mt-0.5">MikroTik Dashboard</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white shadow-elevated border border-navy-200/80 p-8">
          <h2 className="font-display font-semibold text-title text-navy-900 mb-6">Sign in</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-body">
                <AlertCircle className="w-5 h-5 shrink-0" strokeWidth={2} />
                {error}
              </div>
            )}

            <div>
              <label className="block text-label text-navy-600 mb-2">Username, email or phone</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-navy-400" strokeWidth={2} />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="matthew / email / 0792255955"
                  className="input-base pl-12"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-label text-navy-600 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-navy-400" strokeWidth={2} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-base pl-12"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl btn-primary disabled:opacity-60 disabled:cursor-not-allowed flex justify-center"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" strokeWidth={2} />
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-caption text-navy-500 mt-8">Secure router management & WireGuard VPN</p>
      </div>
    </div>
  );
}
