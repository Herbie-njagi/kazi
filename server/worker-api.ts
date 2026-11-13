export interface WorkerEnv {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  PAYSTACK_SECRET_KEY?: string;
  MPESA_CONSUMER_KEY?: string;
  MPESA_CONSUMER_SECRET?: string;
  MPESA_PASSKEY?: string;
  MPESA_SHORTCODE?: string;
  MPESA_ENVIRONMENT?: string;
  MPESA_CALLBACK_URL?: string;
}

interface DarajaCredentials {
  environment: 'sandbox' | 'production';
  shortcode: string;
  consumer_key: string;
  consumer_secret: string;
  passkey: string;
}

interface StkPushState {
  checkoutRequestId: string;
  merchantRequestId?: string;
  status: 'pending' | 'completed' | 'failed';
  resultDesc?: string;
  mpesaReceiptNumber?: string;
  phone: string;
  amount: number;
  businessId: string;
  paymentMethod?: string | null;
  paymentIdentifier?: string | null;
  createdAt: string;
}

const stkTransactions = new Map<string, StkPushState>();

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-paystack-signature',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

function normalizeKenyanPhone(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Enter a valid customer M-Pesa phone number.');
  }
  const digits = value.replace(/\D/g, '');
  const normalized = digits.startsWith('0')
    ? `254${digits.slice(1)}`
    : digits.startsWith('254')
      ? digits
      : `254${digits}`;
  if (!/^254[17]\d{8}$/.test(normalized)) {
    throw new Error('Enter a valid Kenyan M-Pesa phone number (e.g. 07XXXXXXXX or 2547XXXXXXXX).');
  }
  return normalized;
}

function getMpesaTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}${value.hour}${value.minute}${value.second}`;
}

function getDarajaBaseUrl(environment: string): string {
  return environment === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

async function getDarajaAccessToken(
  environment: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<string> {
  const credentials = btoa(`${consumerKey}:${consumerSecret}`);
  const response = await fetch(
    `${getDarajaBaseUrl(environment)}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } },
  );
  const result = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    errorMessage?: string;
  };
  if (!response.ok || typeof result.access_token !== 'string') {
    throw new Error(
      result.errorMessage ||
        'Safaricom Daraja authentication failed. Contact your POS26 platform administrator to verify Daraja credentials.',
    );
  }
  return result.access_token;
}

async function fetchBusinessDarajaCredentials(
  env: WorkerEnv,
  options: {
    businessId?: string;
    accessToken?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    mockCredentials?: Partial<DarajaCredentials> | null;
  },
): Promise<DarajaCredentials | null> {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || options.supabaseUrl || '')
    .trim()
    .replace(/\/$/, '');
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || options.supabaseAnonKey || '').trim();

  if (url && options.businessId && (serviceRoleKey || (anonKey && options.accessToken))) {
    const apiKey = serviceRoleKey || anonKey;
    const authToken = serviceRoleKey || options.accessToken!;
    const rpcRes = await fetch(`${url}/rest/v1/rpc/get_business_mpesa_credentials`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_business_id: options.businessId }),
    });

    if (rpcRes.ok) {
      const rows = (await rpcRes.json().catch(() => [])) as DarajaCredentials[];
      if (
        Array.isArray(rows) &&
        rows[0]?.consumer_key &&
        rows[0]?.consumer_secret &&
        rows[0]?.passkey &&
        rows[0]?.shortcode
      ) {
        return rows[0];
      }
    }
  }

  if (
    options.mockCredentials?.consumer_key &&
    options.mockCredentials?.consumer_secret &&
    options.mockCredentials?.passkey &&
    options.mockCredentials?.shortcode
  ) {
    return {
      environment: options.mockCredentials.environment === 'production' ? 'production' : 'sandbox',
      shortcode: options.mockCredentials.shortcode,
      consumer_key: options.mockCredentials.consumer_key,
      consumer_secret: options.mockCredentials.consumer_secret,
      passkey: options.mockCredentials.passkey,
    };
  }

  const envKey = env.MPESA_CONSUMER_KEY?.trim();
  const envSecret = env.MPESA_CONSUMER_SECRET?.trim();
  const envPasskey = env.MPESA_PASSKEY?.trim();
  const envShortcode = env.MPESA_SHORTCODE?.trim();
  if (envKey && envSecret && envPasskey && envShortcode) {
    return {
      environment:
        (env.MPESA_ENVIRONMENT || 'sandbox').trim().toLowerCase() === 'production'
          ? 'production'
          : 'sandbox',
      shortcode: envShortcode,
      consumer_key: envKey,
      consumer_secret: envSecret,
      passkey: envPasskey,
    };
  }

  return null;
}

async function verifyPaystackSignature(
  secret: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex === signature;
}

export async function handleApiRequest(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  if (request.method === 'GET' && pathname === '/api/health') {
    return jsonResponse({ ok: true, posGateway: 'daraja', subscriptionGateway: 'paystack' });
  }

  if (request.method === 'POST' && pathname === '/api/stk-push') {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        amount?: number;
        phone?: string;
        businessId?: string;
        businessName?: string;
        paymentMethod?: string | null;
        paymentIdentifier?: string | null;
        accessToken?: string;
        supabaseUrl?: string;
        supabaseAnonKey?: string;
        mockCredentials?: Partial<DarajaCredentials> | null;
      };

      const normalizedPhone = normalizeKenyanPhone(body.phone);
      const numericAmount = Math.round(Number(body.amount));
      if (!Number.isFinite(numericAmount) || numericAmount < 1) {
        return jsonResponse({ error: 'Sale total must be at least KES 1 to send an M-Pesa prompt.' }, 400);
      }

      const method = typeof body.paymentMethod === 'string' ? body.paymentMethod.toLowerCase() : 'till';
      if (method === 'pochi' || method === 'phone') {
        return jsonResponse(
          {
            error:
              'Direct M-Pesa STK Push requires your Payment method in Settings to be set to Till Number or Paybill (Safaricom does not support STK Push directly to Pochi or personal phone numbers).',
          },
          400,
        );
      }

      const creds = await fetchBusinessDarajaCredentials(env, {
        businessId: body.businessId,
        accessToken: body.accessToken,
        supabaseUrl: body.supabaseUrl,
        supabaseAnonKey: body.supabaseAnonKey,
        mockCredentials: body.mockCredentials,
      });

      if (!creds) {
        return jsonResponse(
          {
            code: 'DARAJA_NOT_CONFIGURED',
            error: `Direct M-Pesa STK Push is not activated for ${body.businessName || 'this business'} yet. Ask your POS26 platform administrator to configure Daraja for your Till or Paybill, or collect M-Pesa manually and enter the receipt code.`,
          },
          503,
        );
      }

      const cleanedIdentifier =
        typeof body.paymentIdentifier === 'string' ? body.paymentIdentifier.trim() : '';
      const isBuyGoods = method === 'till';
      const transactionType = isBuyGoods ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline';
      const numericIdentifier = /^\d{4,12}$/.test(cleanedIdentifier) ? cleanedIdentifier : '';
      const partyB = numericIdentifier || creds.shortcode;

      const timestamp = getMpesaTimestamp();
      const password = btoa(`${creds.shortcode}${creds.passkey}${timestamp}`);
      const token = await getDarajaAccessToken(
        creds.environment,
        creds.consumer_key,
        creds.consumer_secret,
      );

      const forwardedHost = (
        request.headers.get('x-forwarded-host') ||
        request.headers.get('host') ||
        url.host ||
        ''
      )
        .split(',')[0]
        .trim();
      const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(forwardedHost);
      const originHeader = request.headers.get('origin')?.trim().replace(/\/$/, '');
      const isHttpsOrigin = Boolean(originHeader && originHeader.startsWith('https://'));
      const callbackUrl =
        env.MPESA_CALLBACK_URL?.trim() ||
        (forwardedHost && !isLocalHost
          ? `https://${forwardedHost}/api/stk-callback`
          : isHttpsOrigin
            ? `${originHeader}/api/stk-callback`
            : url.protocol === 'https:'
              ? `${url.origin}/api/stk-callback`
              : 'https://example.com/api/stk-callback');

      const accountReference =
        (body.businessName || cleanedIdentifier || 'POS26')
          .replace(/[^a-zA-Z0-9]/g, '')
          .slice(0, 12) || 'POS26';

      const stkResponse = await fetch(
        `${getDarajaBaseUrl(creds.environment)}/mpesa/stkpush/v1/processrequest`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            BusinessShortCode: creds.shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: transactionType,
            Amount: numericAmount,
            PartyA: normalizedPhone,
            PartyB: partyB,
            PhoneNumber: normalizedPhone,
            CallBackURL: callbackUrl,
            AccountReference: accountReference,
            TransactionDesc: `${body.businessName || 'POS26'} Sale`.slice(0, 30),
          }),
        },
      );

      const result = (await stkResponse.json().catch(() => ({}))) as {
        ResponseCode?: string;
        ResponseDescription?: string;
        CheckoutRequestID?: string;
        MerchantRequestID?: string;
        CustomerMessage?: string;
        errorMessage?: string;
      };

      if (!stkResponse.ok || result.ResponseCode !== '0' || !result.CheckoutRequestID) {
        return jsonResponse(
          {
            error:
              result.errorMessage ||
              result.ResponseDescription ||
              'Safaricom Daraja could not initiate the M-Pesa STK Push. Contact your POS26 platform administrator to verify the shortcode and Daraja credentials.',
          },
          502,
        );
      }

      stkTransactions.set(result.CheckoutRequestID, {
        checkoutRequestId: result.CheckoutRequestID,
        merchantRequestId: result.MerchantRequestID,
        status: 'pending',
        phone: normalizedPhone,
        amount: numericAmount,
        businessId: body.businessId ?? '',
        paymentMethod: method,
        paymentIdentifier: partyB,
        createdAt: new Date().toISOString(),
      });

      return jsonResponse({
        success: true,
        provider: 'daraja',
        checkoutRequestId: result.CheckoutRequestID,
        merchantRequestId: result.MerchantRequestID,
        reference: result.CheckoutRequestID,
        customerMessage:
          result.CustomerMessage ||
          `M-Pesa prompt sent to ${body.phone} for ${body.businessName || 'your business'} (${method.toUpperCase()} ${partyB}).`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initiate M-Pesa STK Push.';
      return jsonResponse({ error: message }, 400);
    }
  }

  if (request.method === 'POST' && pathname === '/api/stk-callback') {
    const body = (await request.json().catch(() => ({}))) as {
      Body?: {
        stkCallback?: {
          CheckoutRequestID?: string;
          MerchantRequestID?: string;
          ResultCode?: number;
          ResultDesc?: string;
          CallbackMetadata?: { Item?: Array<{ Name: string; Value?: unknown }> };
        };
      };
    };
    const callback = body?.Body?.stkCallback;
    if (callback?.CheckoutRequestID) {
      const existing = stkTransactions.get(callback.CheckoutRequestID);
      const items = callback.CallbackMetadata?.Item ?? [];
      const receiptItem = items.find((item) => item.Name === 'MpesaReceiptNumber');
      const mpesaReceiptNumber =
        typeof receiptItem?.Value === 'string' ? receiptItem.Value : undefined;

      stkTransactions.set(callback.CheckoutRequestID, {
        checkoutRequestId: callback.CheckoutRequestID,
        merchantRequestId: callback.MerchantRequestID ?? existing?.merchantRequestId,
        status: Number(callback.ResultCode) === 0 ? 'completed' : 'failed',
        resultDesc: callback.ResultDesc,
        mpesaReceiptNumber,
        phone: existing?.phone ?? '',
        amount: existing?.amount ?? 0,
        businessId: existing?.businessId ?? '',
        paymentMethod: existing?.paymentMethod,
        paymentIdentifier: existing?.paymentIdentifier,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      });
    }
    return jsonResponse({ ResultCode: 0, ResultDesc: 'Accepted' });
  }

  if (request.method === 'GET' && pathname.startsWith('/api/stk-status/')) {
    const checkoutRequestId = decodeURIComponent(pathname.slice('/api/stk-status/'.length));
    const tx = stkTransactions.get(checkoutRequestId);
    if (!tx) {
      return jsonResponse({ error: 'STK Push transaction not found.' }, 404);
    }
    return jsonResponse(tx);
  }

  if (request.method === 'GET' && pathname.startsWith('/api/paystack/verify/')) {
    const paystackSecretKey = env.PAYSTACK_SECRET_KEY?.trim();
    if (!paystackSecretKey) {
      return jsonResponse({ error: 'PAYSTACK_SECRET_KEY is not configured on the server.' }, 503);
    }

    const reference = decodeURIComponent(pathname.slice('/api/paystack/verify/'.length));
    try {
      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${paystackSecretKey}` } },
      );
      const result = (await response.json().catch(() => ({}))) as {
        status?: boolean;
        message?: string;
        data?: { status?: string; reference?: string; amount?: number; gateway_response?: string };
      };
      if (!response.ok || !result.status || !result.data) {
        return jsonResponse(
          { error: result.message || 'Could not verify Paystack transaction.' },
          502,
        );
      }
      return jsonResponse({
        reference: result.data.reference,
        status: result.data.status,
        amountKes: typeof result.data.amount === 'number' ? result.data.amount / 100 : undefined,
        gatewayResponse: result.data.gateway_response,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Verification failed.';
      return jsonResponse({ error: message }, 500);
    }
  }

  if (request.method === 'POST' && pathname === '/api/paystack/webhook') {
    const paystackSecretKey = env.PAYSTACK_SECRET_KEY?.trim();
    const signature = request.headers.get('x-paystack-signature');
    const rawBody = await request.text();

    if (paystackSecretKey && signature) {
      const valid = await verifyPaystackSignature(paystackSecretKey, rawBody, signature);
      if (!valid) {
        return jsonResponse({ error: 'Invalid Paystack signature.' }, 401);
      }
    }

    return new Response('OK', { status: 200, headers: corsHeaders });
  }

  return jsonResponse({ error: 'API route not found.' }, 404);
}
