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

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: {
        key: string;
        email: string;
        amount: number;
        currency?: string;
        ref?: string;
        metadata?: Record<string, any>;
        callback: (response: { reference: string; status: string; trans?: string }) => void;
        onClose: () => void;
      }) => { openIframe: () => void };
    };
  }
}

export function BillingPanel({ businessId, role }: { businessId: string; role: BusinessRole }) {
  const [provider, setProvider] = useState<'mpesa' | 'paystack'>('paystack');
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

    const amountKes = prices[interval];

    // PAYSTACK FLOW: Pure Browser Inline Checkout (using environment variable key)
    if (provider === 'paystack') {
      const pskKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
      if (!pskKey) {
        setError('Payment configuration is incomplete. Please contact support.');
        setBusy(false);
        return;
      }

      // Ensure PaystackPop is loaded
      let hasPop = Boolean(window.PaystackPop);
      if (!hasPop) {
        setNotice('Loading payment gateway…');
        hasPop = await new Promise<boolean>((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://js.paystack.co/v1/inline.js';
          script.async = true;
          script.onload = () => resolve(Boolean(window.PaystackPop));
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });
      }

      if (!hasPop || !window.PaystackPop) {
        setError('Could not load payment gateway. Please check your internet connection.');
        setBusy(false);
        return;
      }

      try {
        const { data: authData } = await supabase.auth.getSession();
        const userEmail = authData.session?.user.email || 'customer@pos26.ke';
        const pskRef = 'PSK_' + Date.now() + '_' + Math.floor(Math.random() * 10000);

        const handler = window.PaystackPop.setup({
          key: pskKey,
          email: userEmail,
          amount: amountKes * 100, // in kobo / cents
          currency: 'KES',
          ref: pskRef,
          metadata: {
            business_id: businessId,
            billing_interval: interval,
          },
          callback: function(response) {
            void (async () => {
              setBusy(true);
              setNotice(`Payment received (Ref: ${response.reference})! Activating subscription…`);
              try {
                // Try record_subscription_payment RPC
                const { error: rpcError } = await supabase.rpc('record_subscription_payment', {
                  p_checkout_id: null,
                  p_provider_reference: response.reference,
                  p_amount_kes: amountKes,
                  p_paid_at: new Date().toISOString(),
                  p_provider_subscription_id: response.trans || response.reference,
                  p_provider_customer_id: null,
                });

                if (rpcError) {
                  // Direct fallback update
                  const now = new Date();
                  const periodEnd = new Date(now.getTime() + (interval === 'yearly' ? 365 : 30) * 86400000);
                  await supabase.from('business_subscriptions').upsert({
                    business_id: businessId,
                    provider: 'paystack',
                    billing_interval: interval,
                    status: 'active',
                    current_period_start: now.toISOString(),
                    current_period_end: periodEnd.toISOString(),
                    provider_subscription_id: response.reference,
                    updated_at: now.toISOString(),
                  });
                }

                await refresh();
                setNotice(`🎉 Subscription activated! Valid for ${interval === 'yearly' ? '1 year' : '1 month'}.`);
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Error updating subscription status.';
                setError(msg);
              } finally {
                setBusy(false);
              }
            })();
          },
          onClose: function() {
            setBusy(false);
            setNotice('Payment was cancelled.');
          },
        });

        handler.openIframe();
        return;
      } catch (inlineErr) {
        setError(inlineErr instanceof Error ? inlineErr.message : 'Error launching payment.');
        setBusy(false);
        return;
      }
    }

    // M-PESA STK PUSH fallback (inform user it requires setup)
    if (provider === 'mpesa') {
      setError('M-Pesa direct payment requires administrative setup. Please use Paystack for immediate card/mobile money payments.');
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
            <option value="paystack">Paystack (Card, M-Pesa, Bank)</option>
            <option value="mpesa">Safaricom M-Pesa (Direct STK Push)</option>
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
            {busy ? 'Processing checkout…' : `Subscribe with ${provider === 'paystack' ? 'Paystack' : 'M-Pesa'} · KES ${prices[interval].toLocaleString('en-KE')}`}
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
