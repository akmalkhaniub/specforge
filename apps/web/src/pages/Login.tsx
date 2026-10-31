/**
 * Login screen. Shown when there is no authenticated user. Posts credentials to
 * the auth context, which stores the JWT and loads the app.
 */
import { FileStack } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../lib/auth';

export function Login(): JSX.Element {
  const { login } = useAuth();
  const [email, setEmail] = useState('demo@acme.test');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch {
      setError('Invalid email or password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full grid place-items-center bg-background text-text p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-surface border border-border rounded-xl p-6 shadow-card">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-9 w-9 grid place-items-center rounded-lg bg-accent text-accent-fg">
            <FileStack size={18} />
          </div>
          <span className="text-xl font-bold tracking-tight">SpecForge</span>
        </div>

        <label className="block text-sm text-muted mb-1">Email</label>
        <input
          type="email"
          className="w-full bg-background border border-border rounded px-3 py-2 mb-3 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />
        <label className="block text-sm text-muted mb-1">Password</label>
        <input
          type="password"
          className="w-full bg-background border border-border rounded px-3 py-2 mb-4 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error ? <div className="text-danger text-sm mb-3">{error}</div> : null}

        <button
          type="submit"
          className="w-full px-4 py-2 rounded bg-accent text-accent-fg text-sm font-medium disabled:opacity-50"
          disabled={busy}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-xs text-muted mt-4 text-center">
          Demo: <span className="text-text">demo@acme.test</span> / <span className="text-text">demo1234</span>
        </p>
      </form>
    </div>
  );
}
