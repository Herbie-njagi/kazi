import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Check, LogOut } from 'lucide-react';
import { getErrorMessage } from './format';
import { supabase } from './lib/supabase';

export function AuthScreen({
  error,
  onClearError,
}: {
  error: string;
  onClearError: () => void;
}) {
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setNotice('');
    onClearError();
    try {
      if (registering) {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() || email.trim().split('@')[0] } },
        });
        if (authError) throw authError;
        if (!data.session) {
          setNotice('Check your email to confirm your account, then sign in.');
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) {
          if (authError.message.includes('Invalid login credentials') || authError.message.includes('Invalid grant')) {
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
              email: email.trim(),
              password,
              options: { data: { display_name: email.trim().split('@')[0] } },
            });
            if (signUpError) throw signUpError;
            if (!signUpData.session) {
              setNotice('Check your email to confirm your account, then sign in.');
            }
            return;
          }
          throw authError;
        }
      }
    } catch (authError) {
      setNotice(getErrorMessage(authError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-layout">
      <aside className="auth-aside">
        <a className="brand" href="/" aria-label="POS26 home">
          <span className="brand-mark">P</span>
          <span className="brand-name">POS26</span>
        </a>
        <div className="auth-aside-copy">
          <p className="eyebrow">MADE FOR YOUR BUSINESS</p>
          <h1>Run your day.<br />Grow your business.</h1>
          <p>Sales, stock, customers and cash flow, brought together in one clear workspace.</p>
          <div className="auth-aside-note"><Check size={17} /> Built for everyday retail</div>
        </div>
        <span className="auth-aside-footer">POS26 <span>·</span> KES</span>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <span className="auth-step">{registering ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}</span>
          <h2>{registering ? 'Get started with POS26' : 'Sign in to your workspace'}</h2>
          <p className="auth-intro">
            {registering
              ? 'Create your account to start setting up your business.'
              : 'Enter your account details to continue.'}
          </p>
          {(error || notice) && (
            <div className={error && !notice ? 'form-notice form-error' : 'form-notice form-info'} role="status">
              {error || notice}
            </div>
          )}
          <form className="form-stack" onSubmit={(event) => void submit(event)}>
            {registering && (
              <label className="field">
                <span>Your name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required maxLength={120} />
              </label>
            )}
            <label className="field">
              <span>Email address</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={registering ? 'new-password' : 'current-password'}
                minLength={8}
                required
              />
              {registering && <small>Use at least 8 characters.</small>}
            </label>
            <button type="submit" className="primary-button full-width" disabled={busy}>
              {busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}
              {!busy && <ArrowRight size={17} />}
            </button>

          </form>
          <p className="auth-toggle">
            {registering ? 'Already have an account?' : 'New to POS26?'}
            <button type="button" onClick={() => { setRegistering(!registering); setNotice(''); onClearError(); }}>
              {registering ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          <p className="auth-security"><Check size={14} /> Your business data is private to your workspace.</p>
        </div>
      </main>
    </div>
  );
}

export function BusinessSetup({
  email,
  error,
  onCreate,
  onSignOut,
}: {
  email: string;
  error: string;
  onCreate: (name: string) => Promise<boolean>;
  onSignOut: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    await onCreate(name.trim());
    setBusy(false);
  };

  return (
    <div className="standalone-screen">
      <section className="standalone-card business-setup-card">
        <span className="standalone-brand"><span className="brand-mark">P</span>POS26</span>
        <span className="auth-step">WORKSPACE SETUP</span>
        <h1>Let’s set up your business.</h1>
        <p>Create a workspace for <strong>{email}</strong>. You can add products and team members after setup.</p>
        {error && <div className="form-notice form-error" role="alert">{error}</div>}
        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Business name</span>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="e.g. Green Market" />
          </label>
          <button type="submit" className="primary-button full-width" disabled={busy}>
            {busy ? 'Creating workspace…' : 'Create workspace'} <ArrowRight size={17} />
          </button>
        </form>
        <button type="button" className="text-button centered" onClick={() => void onSignOut()}>
          <LogOut size={15} /> Sign out
        </button>
      </section>
    </div>
  );
}
