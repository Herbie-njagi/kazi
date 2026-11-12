import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requiredEnv, verifyMpesaCheckout } from '../_shared/payment.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  try {
    const url = new URL(request.url);
    const providedToken = url.searchParams.get('token') ?? '';
    const expectedToken = requiredEnv('MPESA_CALLBACK_TOKEN');
    if (providedToken.length !== expectedToken.length) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }
    let tokenDifference = 0;
    for (let index = 0; index < expectedToken.length; index += 1) {
      tokenDifference |= providedToken.charCodeAt(index) ^ expectedToken.charCodeAt(index);
    }
    if (tokenDifference !== 0) return jsonResponse({ error: 'Unauthorized.' }, 401);

    const body = await request.json();
    const callback = body?.Body?.stkCallback;
    const checkoutRequestId = callback?.CheckoutRequestID;
    if (typeof checkoutRequestId !== 'string') {
      return jsonResponse({ ResultCode: 1, ResultDesc: 'Invalid callback.' }, 400);
    }

    const serviceClient = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: checkout, error: checkoutError } = await serviceClient
      .from('subscription_checkouts')
      .select('id, amount_kes, status')
      .eq('provider', 'mpesa')
      .eq('provider_checkout_id', checkoutRequestId)
      .maybeSingle();
    if (checkoutError) throw checkoutError;
    if (!checkout) return jsonResponse({ ResultCode: 1, ResultDesc: 'Checkout not found.' }, 404);
    if (checkout.status === 'succeeded') {
      return jsonResponse({ ResultCode: 0, ResultDesc: 'Already processed.' });
    }

    if (Number(callback.ResultCode) !== 0) {
      const { error } = await serviceClient
        .from('subscription_checkouts')
        .update({ status: 'failed' })
        .eq('id', checkout.id);
      if (error) throw error;
      return jsonResponse({ ResultCode: 0, ResultDesc: 'Payment failure recorded.' });
    }

    const items: { Name?: string; Value?: string | number }[] =
      callback.CallbackMetadata?.Item ?? [];
    const amount = Number(items.find((item) => item.Name === 'Amount')?.Value);
    const receipt = items.find((item) => item.Name === 'MpesaReceiptNumber')?.Value;
    if (amount !== checkout.amount_kes || typeof receipt !== 'string' || !receipt) {
      throw new Error('M-Pesa callback amount or receipt did not match the checkout.');
    }
    await verifyMpesaCheckout(checkoutRequestId);

    const { error: paymentError } = await serviceClient.rpc('record_subscription_payment', {
      p_checkout_id: checkout.id,
      p_provider_reference: receipt,
      p_amount_kes: amount,
      p_paid_at: new Date().toISOString(),
    });
    if (paymentError) throw paymentError;
    return jsonResponse({ ResultCode: 0, ResultDesc: 'Payment recorded.' });
  } catch (error) {
    console.error('M-Pesa callback failed:', error);
    return jsonResponse({ ResultCode: 1, ResultDesc: 'Payment verification failed.' }, 500);
  }
});
