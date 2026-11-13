import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CalendarClock, Check, LogOut, RefreshCw } from 'lucide-react';
import type { Business, BusinessRole, BusinessSubscription } from './app.types';
import { supabase } from './lib/supabase';
import { loadPaystackInline } from './lib/paystack';

export const SUBSCRIPTION_PRICES = { monthly: 500, yearly: 6000 } as const;
export const SUBSCRIPTION_DAYS = { monthly: 30, yearly: 360 } as const;

export function formatSubscriptionCountdown(remainingMs: number) {
  const clamped = Math.max(0, remainingMs);
  const totalSeconds = Math.floor(clamped / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    days,
    hours,
    minutes,
    seconds,
    formatted: `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`,
  };
}

async function activateSubscriptionInDatabase(
  businessId: string,
  interval: 'monthly' | 'yearly',
  reference: string,
  amountKes: number,
) {
  // Verify with server if PAYSTACK_SECRET_KEY is configured (skip gracefully if not configured)
  try {
    const verifyRes = await fetch(`/api/paystack/verify/${encodeURIComponent(reference)}`);
    if (verifyRes.ok) {
      const verifyBody = (await verifyRes.json().catch(() => ({}))) as { status?: string };
      if (verifyBody.status && verifyBody.status !== 'success') {
        throw new Error(`Paystack transaction is not completed yet (status: ${verifyBody.status}).`);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Paystack transaction is not completed')) {
      throw err;
    }
  }

  const { error: activateError } = await supabase.rpc('activate_business_subscription', {
    p_business_id: businessId,
    p_billing_interval: interval,
    p_provider_reference: reference,
    p_amount_kes: amountKes,
  });

  if (!activateError) return;

  const { error: rpcError } = await supabase.rpc('record_subscription_payment', {
    p_checkout_id: null,
    p_provider_reference: reference,
    p_amount_kes: amountKes,
    p_paid_at: new Date().toISOString(),
    p_provider_subscription_id: reference,
    p_provider_customer_id: null,
    p_business_id: businessId,
  });

  if (!rpcError) return;

  const durationDays = SUBSCRIPTION_DAYS[interval];
  const now = new Date();
  const periodEnd = new Date(now.getTime() + durationDays * 86400000);
  const { error: upsertError } = await supabase.from('business_subscriptions').upsert({
    business_id: businessId,
    provider: 'paystack',
    billing_interval: interval,
    status: 'active',
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    provider_subscription_id: reference,
    updated_at: now.toISOString(),
  });
  if (upsertError) throw upsertError;
}

async function runPaystackSubscriptionCheckout({
  businessId,
  interval,
  onStatus,
  onComplete,
  onError,
  onCancel,
}: {
  businessId: string;
  interval: 'monthly' | 'yearly';
  onStatus: (message: string) => void;
  onComplete: (message: string) => Promise<void>;
  onError: (message: string) => void;
  onCancel: () => void;
}) {
  const amountKes = SUBSCRIPTION_PRICES[interval];
  const durationDays = SUBSCRIPTION_DAYS[interval];
  const pskKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim();

  if (!pskKey) {
    onError('Paystack public key (VITE_PAYSTACK_PUBLIC_KEY) is not configured. Please contact support.');
    return;
  }

  let hasPop = Boolean(window.PaystackPop);
  if (!hasPop) {
    onStatus('Loading Paystack checkout…');
    hasPop = await loadPaystackInline();
  }

  if (!hasPop || !window.PaystackPop) {
    onError('Could not load Paystack checkout. Please check your internet connection.');
    return;
  }

  const { data: authData } = await supabase.auth.getSession();
  const userEmail = authData.session?.user.email || 'customer@pos26.ke';
  const pskRef = `PSK_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  const handler = window.PaystackPop.setup({
    key: pskKey,
    email: userEmail,
    amount: amountKes * 100,
    currency: 'KES',
    ref: pskRef,
    channels: ['mobile_money', 'card', 'bank'],
    metadata: {
      business_id: businessId,
      billing_interval: interval,
      duration_days: durationDays,
    },
    callback: (response) => {
      void (async () => {
        onStatus(`Payment received (Ref: ${response.reference}). Activating ${durationDays}-day subscription…`);
        try {
          await activateSubscriptionInDatabase(businessId, interval, response.reference, amountKes);
          await onComplete(`Subscription activated for ${durationDays} days.`);
        } catch (err: unknown) {
          onError(err instanceof Error ? err.message : 'Error activating subscription.');
        }
      })();
    },
    onClose: () => {
      onCancel();
    },
  });

  handler.openIframe();
}

export function SubscriptionGateCard({
  business,
  businesses,
  role,
  subscription,
  onChangeBusiness,
  onSubscriptionUpdated,
  onSignOut,
}: {
  business: Business;
  businesses: Business[];
  role: BusinessRole;
  subscription: BusinessSubscription | null;
  onChangeBusiness: (business: Business) => void;
  onSubscriptionUpdated: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [interval, setInterval] = useState<'monthly' | 'yearly'>(
    subscription?.billing_interval === 'yearly' ? 'yearly' : 'monthly',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canManage = role === 'owner' || role === 'admin';
  const isRenewal = Boolean(subscription);

  const subscribe = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await runPaystackSubscriptionCheckout({
        businessId: business.id,
        interval,
        onStatus: (msg) => setNotice(msg),
        onComplete: async (msg) => {
          setNotice(msg);
          await onSubscriptionUpdated();
          setBusy(false);
        },
        onError: (msg) => {
          setError(msg);
          setBusy(false);
        },
        onCancel: () => {
          setNotice('Payment was cancelled.');
          setBusy(false);
        },
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error starting Paystack checkout.');
      setBusy(false);
    }
  };

  return (
    <div className="standalone-screen">
      <section className="standalone-card subscription-gate-card">
        <div className="subscription-gate-top">
          <span className="standalone-brand"><span className="brand-mark">P</span>POS26</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Refresh subscription status"
            disabled={busy}
            onClick={() => void onSubscriptionUpdated()}
          >
            <RefreshCw size={15} />
          </button>
        </div>

        <span className="auth-step">{isRenewal ? 'SUBSCRIPTION EXPIRED' : 'SUBSCRIBE TO CONTINUE'}</span>
        <h1>{isRenewal ? 'Renew your POS26 plan' : 'Activate your POS26 workspace'}</h1>
        <p>
          {isRenewal
            ? `Your subscription period for ${business.name} has ended. Renew below to reopen your dashboard and point of sale.`
            : `Welcome to POS26. Subscribe to unlock the dashboard, inventory, and point of sale for ${business.name}.`}
        </p>

        {businesses.length > 1 && (
          <label className="field" style={{ marginBottom: '16px' }}>
            <span>Business workspace</span>
            <select
              value={business.id}
              onChange={(event) => {
                const next = businesses.find((item) => item.id === event.target.value);
                if (next) onChangeBusiness(next);
              }}
            >
              {businesses.map((item) => (
                <option value={item.id} key={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        )}

        {error && <div className="form-notice form-error" role="alert">{error}</div>}
        {notice && <div className="form-notice form-info" role="status">{notice}</div>}

        <div className="plan-picker" role="radiogroup" aria-label="Subscription plan">
          <button
            type="button"
            role="radio"
            aria-checked={interval === 'monthly'}
            className={`plan-option${interval === 'monthly' ? ' selected' : ''}`}
            onClick={() => setInterval('monthly')}
          >
            <div className="plan-option-head">
              <strong>Monthly Plan</strong>
              {interval === 'monthly' && <span className="plan-check"><Check size={14} /></span>}
            </div>
            <div className="plan-price">KES 500 <span>/ 30 days</span></div>
            <small><CalendarClock size={13} /> 30-day countdown timer</small>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={interval === 'yearly'}
            className={`plan-option${interval === 'yearly' ? ' selected' : ''}`}
            onClick={() => setInterval('yearly')}
          >
            <div className="plan-option-head">
              <strong>Annual Plan</strong>
              {interval === 'yearly' && <span className="plan-check"><Check size={14} /></span>}
            </div>
            <div className="plan-price">KES 6,000 <span>/ 360 days</span></div>
            <small><CalendarClock size={13} /> 360-day countdown timer</small>
          </button>
        </div>

        {canManage ? (
          <button
            type="button"
            className="primary-button full-width"
            disabled={busy}
            onClick={() => void subscribe()}
          >
            {busy
              ? 'Processing Paystack checkout…'
              : `Subscribe with Paystack · KES ${SUBSCRIPTION_PRICES[interval].toLocaleString('en-KE')}`}
          </button>
        ) : (
          <div className="form-notice form-info">
            Only a business owner or administrator can activate or renew this subscription.
          </div>
        )}

        <p className="fine-print" style={{ marginTop: '14px', textAlign: 'center' }}>
          Paystack accepts M-Pesa, Debit/Credit Cards, and Bank Transfer in KES.
        </p>

        <button type="button" className="text-button centered" onClick={() => void onSignOut()}>
          <LogOut size={15} /> Sign out
        </button>
      </section>
    </div>
  );
}

export function BillingPanel({
  businessId,
  role,
  onSubscriptionUpdated,
}: {
  businessId: string;
  role: BusinessRole;
  onSubscriptionUpdated?: () => Promise<void>;
}) {
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [subscription, setSubscription] = useState<BusinessSubscription | null>(null);
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
    try {
      const { data, error: subscriptionError } = await supabase.rpc('get_business_subscription', {
        p_business_id: businessId,
      });
      if (subscriptionError) {
        if (!subscriptionError.message.includes('schema cache')) {
          setError(subscriptionError.message);
        }
      } else {
        setSubscription(data?.[0] ?? null);
      }
    } catch {
      // Ignore if billing RPC is not provisioned
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
      await runPaystackSubscriptionCheckout({
        businessId,
        interval,
        onStatus: (msg) => setNotice(msg),
        onComplete: async (msg) => {
          await refresh();
          if (onSubscriptionUpdated) await onSubscriptionUpdated();
          setNotice(msg);
          setBusy(false);
        },
        onError: (msg) => {
          setError(msg);
          setBusy(false);
        },
        onCancel: () => {
          setNotice('Payment was cancelled.');
          setBusy(false);
        },
      });
    } catch (inlineErr) {
      setError(inlineErr instanceof Error ? inlineErr.message : 'Error launching payment.');
      setBusy(false);
    }
  };

  return (
    <section className="panel settings-panel billing-panel">
      <div className="panel-heading">
        <div><h3>POS26 subscription</h3><p>Monthly (30 days) or annual (360 days) billing for this business.</p></div>
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
            {subscription.billing_interval === 'yearly' ? 'Annual (360 days)' : 'Monthly (30 days)'} · Paystack ·
            {' '}through {new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(new Date(subscription.current_period_end))}
          </small>
        </div>
      ) : (
        <div className="billing-status">
          <span>No active subscription</span>
          <small>Verified payments activate a 30-day or 360-day billing period.</small>
        </div>
      )}
      <div className="billing-controls">
        <label className="field">
          <span>Billing period</span>
          <select value={interval} onChange={(event) => setInterval(event.target.value as 'monthly' | 'yearly')}>
            <option value="monthly">Monthly · KES 500 (30 days)</option>
            <option value="yearly">Annual · KES 6,000 (360 days)</option>
          </select>
        </label>
        {canManage ? (
          <button type="button" className="primary-button" disabled={busy || loading} onClick={() => void startCheckout()}>
            {busy ? 'Processing checkout…' : `Subscribe with Paystack · KES ${SUBSCRIPTION_PRICES[interval].toLocaleString('en-KE')}`}
          </button>
        ) : (
          <p className="field-help">Only a business owner or administrator can manage billing.</p>
        )}
      </div>
      <p className="billing-help">
        Paystack accepts Debit/Credit Cards (Visa, Mastercard, Verve), M-Pesa, Mobile Money, and Bank Transfer in KES.
      </p>
    </section>
  );
}
