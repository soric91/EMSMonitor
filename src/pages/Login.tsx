import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, Lock, User, Zap } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch {
      setFormError('Usuario o contraseña incorrectos');
      setShake((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-emerald-500/20 blur-[120px]"
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-amber-500/15 blur-[120px]"
          animate={{ x: [0, -30, 0], y: [0, -20, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30"
          >
            <Zap className="h-7 w-7 text-slate-950" strokeWidth={2.5} />
          </motion.div>
          <h1 className="text-xl font-semibold tracking-tight text-white">EMS Residencial</h1>
          <p className="mt-1 text-sm text-slate-400">Panel de monitoreo energético</p>
        </div>

        <motion.form
          onSubmit={handleSubmit}
          animate={shake > 0 ? { x: [0, -8, 8, -6, 6, 0] } : undefined}
          key={shake}
          transition={{ duration: 0.4 }}
          className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl"
        >
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-xs font-medium text-slate-400">
              Usuario
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-slate-900/60 py-2.5 pl-10 pr-3 text-sm text-white outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
                placeholder="admin"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium text-slate-400">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-slate-900/60 py-2.5 pl-10 pr-10 text-sm text-white outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-300"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {formError && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400"
              >
                {formError}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            disabled={submitting}
            whileHover={{ scale: submitting ? 1 : 1.01 }}
            whileTap={{ scale: submitting ? 1 : 0.98 }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
            ) : (
              'Iniciar sesión'
            )}
          </motion.button>
        </motion.form>
      </motion.div>
    </div>
  );
}
