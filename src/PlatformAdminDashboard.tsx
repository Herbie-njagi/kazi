import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Building2, LogOut, RefreshCw } from 'lucide-react';
import { LoadingScreen } from './components';
import { supabase } from './lib/supabase';

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

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError('Database connection is unavailable.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: overviewError } = await supabase.rpc('get_platform_overview');
    if (overviewError) {
      setError(overviewError.message);
      setOverview(null);
    } else {
      setOverview(data?.[0] ?? { total_businesses: 0, subscribed_businesses: 0 });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="platform-admin-screen">
      <header className="platform-admin-header">
        <a className="brand" href="/" aria-label="POS26 home">
          <span className="brand-mark">P</span>
          <span className="brand-name">POS26</span>
        </a>
        <div className="platform-admin-account">
          <span>{email}</span>
          <button type="button" className="secondary-button" onClick={() => void onSignOut()}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </header>
      <main className="platform-admin-main">
        <div className="page-heading">
          <div>
            <p className="eyebrow">PLATFORM ADMINISTRATION</p>
            <h2>Platform overview</h2>
            <p>Business and verified subscription totals across POS26.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={15} /> Refresh
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
                <span className="platform-admin-stat-label">Total businesses</span>
                <strong>{overview?.total_businesses ?? '—'}</strong>
                <small>Businesses created in POS26</small>
              </article>
              <article className="platform-admin-stat">
                <span className="platform-admin-stat-icon"><BadgeCheck size={19} /></span>
                <span className="platform-admin-stat-label">Subscribed businesses</span>
                <strong>{overview?.subscribed_businesses ?? '—'}</strong>
                <small>Active, provider-verified subscriptions</small>
              </article>
            </section>
            <p className="platform-admin-note">
              Subscription totals include businesses with a verified payment and an unexpired billing period.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
