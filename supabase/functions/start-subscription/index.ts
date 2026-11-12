import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getMpesaAccessToken,
  mpesaBaseUrl,
  mpesaTimestamp,
  normalizeMpesaPhone,
  requiredEnv,
  SUBSCRIPTION_PRICES_KES,
  type BillingInterval,
  type PaymentProvider,
} from '../_shared/payment.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_SITE_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  let checkoutId: string | null = null;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) fail('Sign in to start a subscription.', 401);
    const token = authorization.slice('Bearer '.length);
    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const anonKey = requiredEnv('SUPABASE_ANON_KEY');
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) fail('Your session is invalid. Sign in again.', 401);
    const user = userData.user;

    const body = await request.json();
    const businessId = typeof body.business_id === 'string' ? body.business_id : '';
    const provider = body.provider as PaymentProvider;
    const interval = body.billing_interval as BillingInterval;
    if (!/^[0-9a-f-]{36}$/i.test(businessId)) fail('Choose a valid business.');
    if (provider !== 'mpesa' && provider !== 'paystack') fail('Choose a supported payment provider.');
    if (interval !== 'monthly' && interval !== 'yearly') fail('Choose a valid subscription period.');
    if (!user.email) fail('Your account needs an email address before checkout.');

    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: membership, error: membershipError } = await serviceClient
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      fail('Only a business owner or administrator can manage its subscription.', 403);
    }

    const { data: existingSubscription, error: subscriptionError } = await serviceClient
      .from('business_subscriptions')
      .select('status, current_period_end')
      .eq('business_id', businessId)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;
    if (
      existingSubscription?.status === 'active'
      && new Date(existingSubscription.current_period_end).getTime() > Date.now()
    ) {
      fail('This business already has an active subscription.', 409);
    }

    let paystackPlanCode: string | undefined;
    let mpesaPhone: string | undefined;
    if (provider === 'paystack') {
      paystackPlanCode = requiredEnv(
        interval === 'monthly' ? 'PAYSTACK_MONTHLY_PLAN_CODE' : 'PAYSTACK_YEARLY_PLAN_CODE',
      );
      requiredEnv('PAYSTACK_SECRET_KEY');
      requiredEnv('APP_SITE_URL');
    } else {
      mpesaPhone = normalizeMpesaPhone(body.phone);
      requiredEnv('MPESA_SHORTCODE');
      requiredEnv('MPESA_PASSKEY');
      requiredEnv('MPESA_CALLBACK_TOKEN');
    }

    checkoutId = crypto.randomUUID();
    const amountKes = SUBSCRIPTION_PRICES_KES[interval];
    const { error: checkoutError } = await serviceClient
      .from('subscription_checkouts')
      .insert({
        id: checkoutId,
        business_id: businessId,
        requested_by: user.id,
        provider,
        billing_interval: interval,
        amount_kes: amountKes,
        customer_email: user.email,
        provider_reference: checkoutId,
      });
    if (checkoutError) throw checkoutError;

    if (provider === 'paystack') {
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${requiredEnv('PAYSTACK_SECRET_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          amount: amountKes * 100,
          currency: 'KES',
          reference: checkoutId,
          plan: paystackPlanCode,
          callback_url: requiredEnv('APP_SITE_URL'),
          metadata: {
            checkout_id: checkoutId,
            business_id: businessId,
            billing_interval: interval,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.status || typeof result.data?.authorization_url !== 'string') {
        throw new Error('Paystack could not start checkout. Check the Paystack plan and account settings.');
      }
      return jsonResponse({
        provider,
        status: 'pending',
        authorization_url: result.data.authorization_url,
      });
    }

    const shortCode = requiredEnv('MPESA_SHORTCODE');
    const passkey = requiredEnv('MPESA_PASSKEY');
    const timestamp = mpesaTimestamp();
    const password = btoa(`${shortCode}${passkey}${timestamp}`);
    const token = await getMpesaAccessToken();
    const callbackToken = encodeURIComponent(requiredEnv('MPESA_CALLBACK_TOKEN'));
    const callbackUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mpesa-callback?token=${callbackToken}`;
    const transactionType = Deno.env.get('MPESA_TRANSACTION_TYPE') ?? 'CustomerPayBillOnline';
    if (!['CustomerPayBillOnline', 'CustomerBuyGoodsOnline'].includes(transactionType)) {
      throw new Error('MPESA_TRANSACTION_TYPE must be CustomerPayBillOnline or CustomerBuyGoodsOnline.');
    }
    const response = await fetch(`${mpesaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: transactionType,
        Amount: amountKes,
        PartyA: mpesaPhone,
        PartyB: shortCode,
        PhoneNumber: mpesaPhone,
        CallBackURL: callbackUrl,
        AccountReference: `POS26-${checkoutId.slice(0, 7)}`,
        TransactionDesc: `POS26 ${interval} subscription`,
      }),
    });
    const result = await response.json();
    if (!response.ok || result.ResponseCode !== '0' || typeof result.CheckoutRequestID !== 'string') {
      throw new Error('Safaricom could not start the M-Pesa prompt. Check the Daraja account settings.');
    }
    const { error: updateError } = await serviceClient
      .from('subscription_checkouts')
      .update({ provider_checkout_id: result.CheckoutRequestID })
      .eq('id', checkoutId);
    if (updateError) throw updateError;

    return jsonResponse({
      provider,
      status: 'pending',
      message: 'An M-Pesa payment prompt was sent to your phone. Approve it to activate the subscription.',
    });
  } catch (error) {
    if (checkoutId) {
      const url = Deno.env.get('SUPABASE_URL');
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (url && key) {
        const serviceClient = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        await serviceClient
          .from('subscription_checkouts')
          .update({ status: 'failed' })
          .eq('id', checkoutId)
          .eq('status', 'pending');
      }
    }
    console.error('Subscription checkout failed:', error);
    const status = typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status)
      : 502;
    const message = error instanceof Error ? error.message : 'Subscription checkout failed.';
    return jsonResponse({ error: message }, status);
  }
});
