import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { KeyRound, Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

/** Lo que acepta el CRM. Menos que esto lo rechaza con 422. */
const MIN_LENGTH = 8;

/**
 * Cambio obligatorio de la contraseña inicial.
 *
 * La cuenta la crea un administrador en el CRM con una contraseña de un solo
 * uso. Hasta que el dueño elija la suya, el token que recibe lleva
 * `scope: password_change` y no abre nada más — ni acá ni en ApiEMS. Esta
 * pantalla es la única salida de ese estado, así que no tiene forma de
 * saltearse ni botón de "después".
 */
export default function ChangePassword() {
  const { changePassword, logout, user, isLoading, isAuthenticated, mustChangePassword } =
    useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeated, setRepeated] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // La salida de esta pantalla. `ProtectedRoute` sabe traer acá a quien tiene
  // la contraseña pendiente, pero nada sacaba de acá al que ya la cambió: el
  // formulario se guardaba bien, la sesión quedaba lista, y la pantalla seguía
  // siendo la misma. Sin botón de volver ni de cerrar, eso se ve como colgado.
  //
  // Va a `/dashboard` y no a `/proyectos` aunque sea un administrador:
  // `ProtectedRoute` ya reenvía a elegir empresa cuando hace falta, y duplicar
  // esa regla acá deja dos lugares que se pueden desincronizar.
  if (!isLoading && !mustChangePassword && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (newPassword.length < MIN_LENGTH) {
      setFormError(`La nueva contraseña necesita al menos ${MIN_LENGTH} caracteres`);
      return;
    }
    if (newPassword !== repeated) {
      setFormError('Las dos contraseñas nuevas no coinciden');
      return;
    }
    if (newPassword === currentPassword) {
      setFormError('Tiene que ser distinta de la que te dieron');
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch {
      setFormError('La contraseña actual no es correcta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/60 p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-500/10 text-accent-400">
            <KeyRound className="h-5 w-5" />
          </span>
          <h1 className="text-lg font-semibold text-white">Elegí tu contraseña</h1>
          <p className="text-sm text-slate-400">
            La que te dieron es de un solo uso. Hasta que la cambies no podés ver tu consumo.
          </p>
          {user && <p className="text-xs text-slate-500">{user.email}</p>}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field
            id="current-password"
            label="Contraseña actual"
            value={currentPassword}
            autoComplete="current-password"
            onChange={setCurrentPassword}
          />
          <Field
            id="new-password"
            label="Nueva contraseña"
            value={newPassword}
            autoComplete="new-password"
            onChange={setNewPassword}
            hint={`Mínimo ${MIN_LENGTH} caracteres.`}
          />
          <Field
            id="repeat-password"
            label="Repetila"
            value={repeated}
            autoComplete="new-password"
            onChange={setRepeated}
          />

          {formError && (
            <p role="alert" className="text-sm text-rose-400">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-1 rounded-lg bg-accent-500 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-accent-400 disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar y entrar'}
          </button>

          <button
            type="button"
            onClick={() => void logout()}
            className="text-xs text-slate-500 transition hover:text-slate-300"
          >
            Salir
          </button>
        </form>
      </div>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  hint?: string;
  onChange: (value: string) => void;
}

function Field({ id, label, value, autoComplete, hint, onChange }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-slate-400">
        {label}
      </label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          id={id}
          type="password"
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-slate-900/60 py-2.5 pl-10 pr-3 text-sm text-white outline-none transition focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20"
        />
      </div>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
