import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Timer, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-950 relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-brand-600/20 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-violet-600/15 blur-[120px]" />
      <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-indigo-500/10 blur-[100px]" />

      <div className="relative w-full max-w-[400px] mx-4 animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-full h-24 bg-white rounded-2xl p-4 flex items-center justify-center mb-4 shadow-xl border border-surface-200">
            <img src="/logo.png" alt="Barry Wehmiller Logo" className="h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">TimeSheet</h1>
          <p className="text-sm text-surface-400 mt-1">Employee Time Tracking Portal</p>
        </div>

        {/* Login card */}
        <div className="bg-surface-900/80 backdrop-blur-xl border border-surface-800 rounded-2xl p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">Sign in</h2>
            <p className="text-sm text-surface-500 mt-0.5">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-surface-400 mb-1.5">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-surface-800/60 border border-surface-700 text-white placeholder:text-surface-600 focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-surface-400 mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl bg-surface-800/60 border border-surface-700 text-white placeholder:text-surface-600 focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                bg-gradient-to-r from-brand-600 to-brand-500 text-white
                hover:from-brand-500 hover:to-brand-400
                shadow-lg shadow-brand-600/25 hover:shadow-brand-500/40
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200 active:scale-[0.98]"
              id="login-btn"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

        </div>

        {msalEnabled && (
          <>
            <div className="flex items-center gap-3 my-6 mx-8">
              <div className="h-px bg-surface-700 flex-1" />
              <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">Or</span>
              <div className="h-px bg-surface-700 flex-1" />
            </div>

            <div className="bg-surface-900/80 backdrop-blur-xl border border-surface-800 rounded-2xl p-6 shadow-xl mx-4">
              <button
                type="button"
                onClick={async () => {
                  try {
                    setLoading(true);
                    await loginWithMicrosoft();
                    toast.success('Welcome back!');
                    navigate('/');
                  } catch (err) {
                    toast.error(err.message || 'Microsoft login failed');
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold
                  bg-white text-gray-900 border border-gray-200
                  hover:bg-gray-50 focus:ring-4 focus:ring-gray-100
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-200"
              >
                <svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 10H0V0H10V10Z" fill="#F25022"/>
                  <path d="M21 10H11V0H21V10Z" fill="#7FBA00"/>
                  <path d="M10 21H0V11H10V21Z" fill="#00A4EF"/>
                  <path d="M21 21H11V11H21V21Z" fill="#FFB900"/>
                </svg>
                Sign in with Microsoft
              </button>
            </div>
          </>
        )}

        <p className="text-center text-xs text-surface-600 mt-6">
          Internal use only • {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
