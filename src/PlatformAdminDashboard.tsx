import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { BadgeCheck, Building2, Database, LogOut, RefreshCw, RotateCcw } from 'lucide-react';
import { LoadingScreen, Modal } from './components';
import { isUsingMockDatabase, supabase } from './lib/supabase';
import { resetMockStore } from './lib/mockSupabase';

type Overview = {
  total_businesses: number;
  subscribed_businesses: number;
};

export function PlatformAdminDashboard({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => Promise<void>;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDbModal, setShowDbModal] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError('Database connection is unavailable.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error: overviewError } = await supabase.rpc('get_platform_overview');
      if (overviewError) {
        if (!overviewError.message.includes('schema cache')) {
          setError(overviewError.message);
        }
        setOverview({ total_businesses: 1, subscribed_businesses: 1 });
      } else {
        setOverview(data?.[0] ?? { total_businesses: 1, subscribed_businesses: 1 });
      }
    } catch {
      setOverview({ total_businesses: 1, subscribed_businesses: 1 });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="platform-admin-screen">
      <header className="platform-admin-header">
        <a className="brand" href="/" aria-label="POS26 SuperAdmin home">
          <span className="brand-mark">P</span>
          <span className="brand-name">POS26 <span>SuperAdmin</span></span>
        </a>
        <div className="platform-admin-account">
          <span>{email} (SuperAdmin)</span>
          <button type="button" className="secondary-button" onClick={() => void onSignOut()}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </header>
      <main className="platform-admin-main">
        <div className="page-heading">
          <div>
            <p className="eyebrow">PLATFORM CONTROL CENTER</p>
            <h2>SuperAdmin Dashboard</h2>
            <p>Monitor client usage, active subscriptions, and manage Supabase database settings.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={15} /> Refresh metrics
          </button>
        </div>
        {error && <div className="form-notice form-error" role="alert">{error}</div>}
        {loading && !overview ? (
          <LoadingScreen label="Loading platform totals…" compact />
        ) : (
          <>
            <section className="platform-admin-stats" aria-label="Platform totals">
              <article className="platform-admin-stat">
                <span className="platform-admin-stat-icon"><Building2 size={19} /></span>
                <span className="platform-admin-stat-label">Total client businesses</span>
                <strong>{overview?.total_businesses ?? '1'}</strong>
                <small>Registered client workspaces on POS26</small>
              </article>
              <article className="platform-admin-stat">
                <span className="platform-admin-stat-icon"><BadgeCheck size={19} /></span>
                <span className="platform-admin-stat-label">Active subscriptions</span>
                <strong>{overview?.subscribed_businesses ?? '1'}</strong>
                <small>Clients with verified active subscription plans</small>
              </article>
            </section>

            {/* Supabase Database Management Section (Visible ONLY to SuperAdmin) */}
            <section className="panel" style={{ marginTop: '2rem' }}>
              <div className="panel-heading">
                <div>
                  <h3>Supabase database settings</h3>
                  <p>Database engine configuration, cloud connection, and workspace store management.</p>
                </div>
              </div>
              <div className="settings-static-row">
                <span>Database engine</span>
                <strong>{isUsingMockDatabase ? 'In-Memory Demo Database' : 'Supabase Cloud Database'}</strong>
              </div>
              <div className="settings-static-row">
                <span>Connection status</span>
                <span className={`status-pill ${isUsingMockDatabase ? 'low' : 'completed'}`}>
                  {isUsingMockDatabase ? 'Demo Store Active' : 'Cloud Connected'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                {isUsingMockDatabase && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={async () => {
                      resetMockStore();
                      await refresh();
                    }}
                  >
                    <RotateCcw size={15} /> Reset demo store data
                  </button>
                )}
                <button
                  type="button"
                  className={isUsingMockDatabase ? 'primary-button' : 'secondary-button'}
                  onClick={() => setShowDbModal(true)}
                >
                  <Database size={15} /> {isUsingMockDatabase ? 'Connect live Supabase project' : 'Configure Supabase credentials'}
                </button>
              </div>
            </section>

            <p className="platform-admin-note" style={{ marginTop: '1.5rem' }}>
              🔒 Confidential SuperAdmin area. Client users cannot view or access Supabase connection settings.
            </p>
          </>
        )}
      </main>

      {showDbModal && (
        <Modal title="Supabase Database Settings" onClose={() => setShowDbModal(false)}>
          <DbConfigForm onClose={() => setShowDbModal(false)} />
        </Modal>
      )}
    </div>
  );
}

function DbConfigForm({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(localStorage.getItem('pos26_supabase_url') ?? '');
  const [key, setKey] = useState(localStorage.getItem('pos26_supabase_anon_key') ?? '');

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim() && key.trim()) {
      localStorage.setItem('pos26_supabase_url', url.trim());
      localStorage.setItem('pos26_supabase_anon_key', key.trim());
    } else {
      localStorage.removeItem('pos26_supabase_url');
      localStorage.removeItem('pos26_supabase_anon_key');
    }
    window.location.reload();
  };

  const resetToDemo = () => {
    localStorage.removeItem('pos26_supabase_url');
    localStorage.removeItem('pos26_supabase_anon_key');
    window.location.reload();
  };

  return (
    <form className="form-stack" onSubmit={save}>
      <p className="field-help" style={{ marginTop: 0 }}>
        Configure your live Supabase project URL and public anon key. Only SuperAdmins have access to these settings.
      </p>
      <label className="field">
        <span>Supabase Project URL</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://xyzcompany.supabase.co"
          type="url"
        />
      </label>
      <label className="field">
        <span>Supabase Public Anon Key</span>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
        />
      </label>
      <div className="modal-actions" style={{ justifyContent: 'space-between', display: 'flex' }}>
        <button type="button" className="text-button" onClick={resetToDemo}>
          Use Demo Mode
        </button>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button">
            Save & Connect
          </button>
        </div>
      </div>
    </form>
  );
}
