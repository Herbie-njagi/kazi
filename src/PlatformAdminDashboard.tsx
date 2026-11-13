import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  BadgeCheck,
  Building2,
  Check,
  Database,
  LogOut,
  RefreshCw,
  RotateCcw,
  Smartphone,
} from 'lucide-react';
import { LoadingScreen, Modal } from './components';
import { isUsingMockDatabase, supabase } from './lib/supabase';
import { resetMockStore } from './lib/mockSupabase';

type Overview = {
  total_businesses: number;
  subscribed_businesses: number;
};

type PlatformBusiness = {
  id: string;
  name: string;
  payment_method: string | null;
  payment_identifier: string | null;
  subscription_status: string;
  mpesa_configured: boolean;
  mpesa_environment: 'sandbox' | 'production' | null;
  mpesa_shortcode: string | null;
  mpesa_consumer_key: string | null;
};

export function PlatformAdminDashboard({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => Promise<void>;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [businesses, setBusinesses] = useState<PlatformBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDbModal, setShowDbModal] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<PlatformBusiness | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError('Database connection is unavailable.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [overviewRes, businessesRes] = await Promise.all([
        supabase.rpc('get_platform_overview'),
        supabase.rpc('get_platform_businesses'),
      ]);

      if (overviewRes.error) {
        if (!overviewRes.error.message.includes('schema cache')) {
          setError(overviewRes.error.message);
        }
        setOverview({ total_businesses: 0, subscribed_businesses: 0 });
      } else {
        setOverview(overviewRes.data?.[0] ?? { total_businesses: 0, subscribed_businesses: 0 });
      }

      if (businessesRes.error) {
        if (!businessesRes.error.message.includes('schema cache') && !overviewRes.error) {
          setError(businessesRes.error.message);
        }
        setBusinesses([]);
      } else {
        setBusinesses(businessesRes.data ?? []);
      }
    } catch {
      setOverview({ total_businesses: 0, subscribed_businesses: 0 });
      setBusinesses([]);
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
            <p>Monitor client usage, configure per-business Daraja M-Pesa keys, and manage Supabase database settings.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={15} /> Refresh metrics
          </button>
        </div>
        {error && <div className="form-notice form-error" role="alert">{error}</div>}
        {success && <div className="notice notice-success" role="status"><Check size={16} /> <span>{success}</span></div>}
        {loading && !overview ? (
          <LoadingScreen label="Loading platform totals…" compact />
        ) : (
          <>
            <section className="platform-admin-stats" aria-label="Platform totals">
              <article className="platform-admin-stat">
                <span className="platform-admin-stat-icon"><Building2 size={19} /></span>
                <span className="platform-admin-stat-label">Total client businesses</span>
                <strong>{overview?.total_businesses ?? '0'}</strong>
                <small>Registered client workspaces on POS26</small>
              </article>
              <article className="platform-admin-stat">
                <span className="platform-admin-stat-icon"><BadgeCheck size={19} /></span>
                <span className="platform-admin-stat-label">Active subscriptions</span>
                <strong>{overview?.subscribed_businesses ?? '0'}</strong>
                <small>Clients with verified active subscription plans</small>
              </article>
            </section>

            {/* Client M-Pesa Daraja Configuration (Visible ONLY to SuperAdmin) */}
            <section className="panel platform-admin-panel">
              <div className="panel-heading">
                <div>
                  <h3>Client M-Pesa Daraja setup</h3>
                  <p>
                    Configure each client&apos;s Safaricom Daraja STK Push credentials privately so their M-Pesa prompts
                    display their business name and settle directly to their Till or Paybill.
                  </p>
                </div>
              </div>
              {businesses.length === 0 ? (
                <p className="field-help">No client businesses found yet.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Business</th>
                        <th>Till / Paybill</th>
                        <th>Subscription</th>
                        <th>Daraja STK</th>
                        <th className="align-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {businesses.map((biz) => (
                        <tr key={biz.id}>
                          <td><strong>{biz.name}</strong></td>
                          <td>
                            {biz.payment_identifier
                              ? `${(biz.payment_method ?? 'till').toUpperCase()} · ${biz.payment_identifier}`
                              : 'Not set by client'}
                          </td>
                          <td>
                            <span className={`status-pill ${biz.subscription_status === 'active' ? 'completed' : 'low'}`}>
                              {biz.subscription_status === 'active' ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <span className={`status-pill ${biz.mpesa_configured ? 'completed' : 'refunded'}`}>
                              {biz.mpesa_configured
                                ? `${biz.mpesa_environment === 'production' ? 'Live' : 'Sandbox'} · ${biz.mpesa_shortcode}`
                                : 'Not configured'}
                            </span>
                          </td>
                          <td className="align-right">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => {
                                setError('');
                                setSuccess('');
                                setEditingBusiness(biz);
                              }}
                            >
                              <Smartphone size={14} /> {biz.mpesa_configured ? 'Update Daraja' : 'Configure Daraja'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Supabase Database Management Section (Visible ONLY to SuperAdmin) */}
            <section className="panel platform-admin-panel">
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
              <div className="platform-admin-actions">
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

            <p className="platform-admin-note">
              Confidential SuperAdmin area. Client accounts cannot view or access Daraja API keys or Supabase connection settings.
            </p>
          </>
        )}
      </main>

      {showDbModal && (
        <Modal title="Supabase Database Settings" onClose={() => setShowDbModal(false)}>
          <DbConfigForm onClose={() => setShowDbModal(false)} />
        </Modal>
      )}

      {editingBusiness && (
        <Modal title={`M-Pesa Daraja — ${editingBusiness.name}`} onClose={() => setEditingBusiness(null)}>
          <DarajaConfigForm
            business={editingBusiness}
            onClose={() => setEditingBusiness(null)}
            onSaved={async (msg) => {
              setEditingBusiness(null);
              setSuccess(msg);
              await refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function DarajaConfigForm({
  business,
  onClose,
  onSaved,
}: {
  business: PlatformBusiness;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>(
    business.mpesa_environment ?? 'production',
  );
  const [shortcode, setShortcode] = useState(
    business.mpesa_shortcode ?? business.payment_identifier ?? '',
  );
  const [consumerKey, setConsumerKey] = useState(business.mpesa_consumer_key ?? '');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [passkey, setPasskey] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setFormError('');
    try {
      const { error } = await supabase.rpc('save_business_mpesa_credentials', {
        p_business_id: business.id,
        p_environment: environment,
        p_shortcode: shortcode.trim(),
        p_consumer_key: consumerKey.trim(),
        p_consumer_secret: consumerSecret.trim() || null,
        p_passkey: passkey.trim() || null,
      });
      if (error) throw error;
      await onSaved(`Daraja STK Push credentials saved for ${business.name}.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save Daraja credentials.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
      {formError && <div className="form-notice form-error" role="alert">{formError}</div>}
      <label className="field">
        <span>Daraja environment</span>
        <select
          value={environment}
          onChange={(event) => setEnvironment(event.target.value as 'sandbox' | 'production')}
        >
          <option value="production">Production (Live M-Pesa)</option>
          <option value="sandbox">Sandbox (Testing)</option>
        </select>
      </label>
      <label className="field">
        <span>Business Shortcode <small>Store/HO No. for Till, or Paybill No.</small></span>
        <input
          value={shortcode}
          onChange={(event) => setShortcode(event.target.value)}
          required
          minLength={4}
          maxLength={12}
          placeholder="e.g. 174379 or Store Number"
        />
      </label>
      <label className="field">
        <span>Daraja Consumer Key</span>
        <input
          value={consumerKey}
          onChange={(event) => setConsumerKey(event.target.value)}
          required
          minLength={8}
          placeholder="Paste Daraja app consumer key"
        />
      </label>
      <label className="field">
        <span>Daraja Consumer Secret</span>
        <input
          type="password"
          value={consumerSecret}
          onChange={(event) => setConsumerSecret(event.target.value)}
          required={!business.mpesa_configured}
          minLength={8}
          placeholder={business.mpesa_configured ? 'Leave blank to keep saved secret' : 'Paste Daraja app consumer secret'}
        />
      </label>
      <label className="field">
        <span>Lipa na M-Pesa Passkey</span>
        <input
          type="password"
          value={passkey}
          onChange={(event) => setPasskey(event.target.value)}
          required={!business.mpesa_configured}
          minLength={12}
          placeholder={business.mpesa_configured ? 'Leave blank to keep saved passkey' : 'Paste Daraja online passkey'}
        />
      </label>
      <p className="field-help">
        Callback URL is auto-handled at{' '}
        <code>{typeof window !== 'undefined' ? `${window.location.origin}/api/stk-callback` : '/api/stk-callback'}</code>.
      </p>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={saving}>
          <Check size={15} /> {saving ? 'Saving…' : 'Save Daraja settings'}
        </button>
      </div>
    </form>
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
      <p className="field-help">
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
      <div className="modal-actions">
        <button type="button" className="text-button" onClick={resetToDemo}>
          Use Demo Mode
        </button>
        <button type="button" className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="primary-button">
          Save & Connect
        </button>
      </div>
    </form>
  );
}
