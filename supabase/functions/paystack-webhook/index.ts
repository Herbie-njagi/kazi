import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requiredEnv } from '../_shared/payment.ts';

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function validSignature(payload: string, provided: string, secret: string): Promise<boolean> {
  if (!provided || provided.length !== 128) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const signature = toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  let difference = 0;
  for (let index = 0; index < signature.length; index += 1) {
    difference |= signature.charCodeAt(index) ^ provided.toLowerCase().charCodeAt(index);
  }
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed.', { status: 405 });
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-paystack-signature') ?? '';
    if (!await validSignature(rawBody, signature, requiredEnv('PAYSTACK_SECRET_KEY'))) {
      return new Response('Invalid signature.', { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const serviceClient = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const data = event.data ?? {};

    if (event.event === 'charge.success') {
      if (data.status !== 'success' || data.currency !== 'KES') {
        return new Response('Ignored unsupported charge.', { status: 200 });
      }
      const reference = typeof data.reference === 'string' ? data.reference : '';
      const amountKes = Number(data.amount) / 100;
      if (!Number.isInteger(amountKes) || !reference) {
        return new Response('Invalid charge data.', { status: 400 });
      }

      const { data: checkout, error: checkoutError } = await serviceClient
        .from('subscription_checkouts')
        .select('id, amount_kes')
        .eq('provider', 'paystack')
        .eq('provider_reference', reference)
        .maybeSingle();
      if (checkoutError) throw checkoutError;

      const subscriptionId =
        data.subscription_code
        ?? data.subscription?.subscription_code
        ?? data.subscription?.code
        ?? null;
      const customerId =
        data.customer?.customer_code
        ?? data.customer_code
        ?? null;

      if (checkout) {
        if (checkout.amount_kes !== amountKes) {
          throw new Error('Paystack charge amount did not match the checkout.');
        }
        const { error } = await serviceClient.rpc('record_subscription_payment', {
          p_checkout_id: checkout.id,
          p_provider_reference: reference,
          p_amount_kes: amountKes,
          p_paid_at: data.paid_at ?? new Date().toISOString(),
          p_provider_subscription_id: typeof subscriptionId === 'string' ? subscriptionId : null,
          p_provider_customer_id: typeof customerId === 'string' ? customerId : null,
        });
        if (error) throw error;
        return new Response('Payment recorded.', { status: 200 });
      }

      if (typeof subscriptionId === 'string') {
        const { error } = await serviceClient.rpc('record_subscription_payment', {
          p_checkout_id: null,
          p_provider_reference: reference,
          p_amount_kes: amountKes,
          p_paid_at: data.paid_at ?? new Date().toISOString(),
          p_provider_subscription_id: subscriptionId,
        });
        if (error) throw error;
      }
      return new Response('Charge processed.', { status: 200 });
    }

    if (event.event === 'subscription.create') {
      const subscriptionId = data.subscription_code;
      const checkoutId = data.metadata?.checkout_id;
      if (typeof subscriptionId === 'string' && typeof checkoutId === 'string') {
        const { data: checkout, error } = await serviceClient
          .from('subscription_checkouts')
          .select('business_id')
          .eq('id', checkoutId)
          .eq('provider', 'paystack')
          .maybeSingle();
        if (error) throw error;
        if (checkout) {
          const { error: updateError } = await serviceClient
            .from('business_subscriptions')
            .update({ provider_subscription_id: subscriptionId })
            .eq('business_id', checkout.business_id);
          if (updateError) throw updateError;
        }
      }
    }

    if (event.event === 'subscription.disable' || event.event === 'invoice.payment_failed') {
      const subscriptionId = data.subscription?.subscription_code ?? data.subscription_code;
      if (typeof subscriptionId === 'string') {
        const { error } = await serviceClient
          .from('business_subscriptions')
          .update({
            status: event.event === 'subscription.disable' ? 'cancelled' : 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('provider', 'paystack')
          .eq('provider_subscription_id', subscriptionId);
        if (error) throw error;
      }
    }

    return new Response('Event processed.', { status: 200 });
  } catch (error) {
    console.error('Paystack webhook failed:', error);
    return new Response('Webhook processing failed.', { status: 500 });
  }
});
