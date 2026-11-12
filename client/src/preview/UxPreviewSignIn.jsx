/**
 * Email/password sign-in for the isolated UX preview build only.
 */
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';

const DEFAULT_PREVIEW_EMAIL = 'ux-reviewer@preview.stealorreveal.test';

export function UxPreviewSignIn({ onClose }) {
  const { signInWithEmailAndPassword } = useAuth();
  const [email, setEmail] = useState(DEFAULT_PREVIEW_EMAIL);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const result = await signInWithEmailAndPassword(email.trim(), password);
    if (!result.success) {
      setError(result.error || 'Sign-in failed');
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-amber-500/40 bg-slate-900 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-white mb-1">UX preview sign-in</h2>
        <p className="text-sm text-slate-400 mb-4">
          Test accounts only. This screen is not shipped in the production stealorreveal.com build.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="email"
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <Input
            type="password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
