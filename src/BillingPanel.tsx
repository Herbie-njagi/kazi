import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, RefreshCw } from 'lucide-react';
import type { BusinessRole } from './app.types';
import { supabase } from './lib/supabase';

type Subscription = {
  provider: string;
  billing_interval: string;
  status: string;
  current_period_end: string;
};

const prices = { monthly: 500, yearly: 6000 } as const;

export function BillingPanel({ businessId, role }: { businessId: string; role: BusinessRole }) {
  const [provider, setProvider] = useState<'mpesa' | 'paystack'>('mpesa');
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [phone, setPhone] = useState('');
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canManage = role === 'owner' || role === 'admin';

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError('Database connection is unavailable.');
      setLoading(false);
      return;
    }
    setError('');
    const { data, error: subscriptionError } = await supabase.rpc('get_business_subscription', {
      p_business_id: businessId,
    });
    if (subscriptionError) {
      setError(subscriptionError.message);
    } else {
      setSubscription(data?.[0] ?? null);
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startCheckout = async () => {
    if (!supabase) {
      setError('Database connection is unavailable.');
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { data, error: checkoutError } = await supabase.functions.invoke('start-subscription', {
        body: {
          business_id: businessId,
          provider,
          billing_interval: interval,
          ...(provider === 'mpesa' ? { phone } : {}),
        },
      });
      if (checkoutError) throw checkoutError;
      if (provider === 'paystack') {
        const authorizationUrl = data?.authorization_url;
        if (typeof authorizationUrl !== 'string') throw new Error('Paystack did not return a checkout link.');
        window.location.assign(authorizationUrl);
        return;
      }
      setNotice(typeof data?.message === 'string' ? data.message : 'M-Pesa prompt sent.');
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Could not start subscription checkout.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel settings-panel billing-panel">
      <div className="panel-heading">
        <div><h3>POS26 subscription</h3><p>Choose monthly or yearly billing for this business.</p></div>
        <button type="button" className="icon-button" aria-label="Refresh subscription status" onClick={() => void refresh()}>
          <RefreshCw size={15} />
        </button>
      </div>
      {error && <div className="form-notice form-error" role="alert">{error}</div>}
      {notice && <div className="form-notice form-info" role="status">{notice}</div>}
      {loading ? (
        <p className="billing-status">Loading subscription status…</p>
      ) : subscription ? (
        <div className="billing-status">
          <span><BadgeCheck size={16} /> {subscription.status.replace('_', ' ')}</span>
          <small>
            {subscription.billing_interval} · {subscription.provider === 'mpesa' ? 'M-Pesa' : 'Paystack'} ·
            {' '}through {new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(new Date(subscription.current_period_end))}
          </small>
        </div>
      ) : (
        <div className="billing-status">
          <span>No active subscription</span>
          <small>Verified payments activate the selected billing period.</small>
        </div>
      )}
      <div className="billing-controls">
        <label className="field">
          <span>Billing period</span>
          <select value={interval} onChange={(event) => setInterval(event.target.value as 'monthly' | 'yearly')}>
            <option value="monthly">Monthly · KES 500</option>
            <option value="yearly">Yearly · KES 6,000</option>
          </select>
        </label>
        <label className="field">
          <span>Payment provider</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value as 'mpesa' | 'paystack')}>
            <option value="mpesa">Safaricom M-Pesa</option>
            <option value="paystack">Paystack</option>
          </select>
        </label>
        {provider === 'mpesa' && (
          <label className="field">
            <span>M-Pesa phone number</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="07XX XXX XXX"
              required
            />
          </label>
        )}
        {canManage ? (
          <button type="button" className="primary-button" disabled={busy || loading} onClick={() => void startCheckout()}>
            {busy ? 'Starting checkout…' : `Subscribe · KES ${prices[interval].toLocaleString('en-KE')}`}
          </button>
        ) : (
          <p className="field-help">Only a business owner or administrator can manage billing.</p>
        )}
      </div>
      <p className="billing-help">
        Paystack renews automatically when its subscription plan is configured. M-Pesa renewals must be initiated by a business owner.
      </p>
    </section>
  );
}
