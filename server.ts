import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
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

async function fetchBusinessDarajaCredentials(options: {
  businessId?: string;
  accessToken?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  mockCredentials?: Partial<DarajaCredentials> | null;
}): Promise<DarajaCredentials | null> {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    options.supabaseUrl ||
    ''
  )
    .trim()
    .replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    options.supabaseAnonKey ||
    ''
  ).trim();

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
      if (Array.isArray(rows) && rows[0]?.consumer_key && rows[0]?.consumer_secret && rows[0]?.passkey && rows[0]?.shortcode) {
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

  const envKey = process.env.MPESA_CONSUMER_KEY?.trim();
  const envSecret = process.env.MPESA_CONSUMER_SECRET?.trim();
  const envPasskey = process.env.MPESA_PASSKEY?.trim();
  const envShortcode = process.env.MPESA_SHORTCODE?.trim();
  if (envKey && envSecret && envPasskey && envShortcode) {
    return {
      environment: (process.env.MPESA_ENVIRONMENT || 'sandbox').trim().toLowerCase() === 'production'
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

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, posGateway: 'daraja', subscriptionGateway: 'paystack' });
  });

  // Direct per-business Safaricom M-Pesa Daraja STK Push for POS checkout
  app.post('/api/stk-push', async (req, res) => {
    try {
      const {
        amount,
        phone,
        businessId,
        businessName,
        paymentMethod,
        paymentIdentifier,
        accessToken,
        supabaseUrl,
        supabaseAnonKey,
        mockCredentials,
      } = req.body as {
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

      const normalizedPhone = normalizeKenyanPhone(phone);
      const numericAmount = Math.round(Number(amount));
      if (!Number.isFinite(numericAmount) || numericAmount < 1) {
        res.status(400).json({ error: 'Sale total must be at least KES 1 to send an M-Pesa prompt.' });
        return;
      }

      const method = typeof paymentMethod === 'string' ? paymentMethod.toLowerCase() : 'till';
      if (method === 'pochi' || method === 'phone') {
        res.status(400).json({
          error:
            'Direct M-Pesa STK Push requires your Payment method in Settings to be set to Till Number or Paybill (Safaricom does not support STK Push directly to Pochi or personal phone numbers).',
        });
        return;
      }

      const creds = await fetchBusinessDarajaCredentials({
        businessId,
        accessToken,
        supabaseUrl,
        supabaseAnonKey,
        mockCredentials,
      });

      if (!creds) {
        res.status(503).json({
          code: 'DARAJA_NOT_CONFIGURED',
          error:
            `Direct M-Pesa STK Push is not activated for ${businessName || 'this business'} yet. Ask your POS26 platform administrator to configure Daraja for your Till or Paybill, or collect M-Pesa manually and enter the receipt code.`,
        });
        return;
      }

      const cleanedIdentifier = typeof paymentIdentifier === 'string' ? paymentIdentifier.trim() : '';
      const isBuyGoods = method === 'till';
      const transactionType = isBuyGoods ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline';
      const numericIdentifier = /^\d{4,12}$/.test(cleanedIdentifier) ? cleanedIdentifier : '';
      const partyB = numericIdentifier || creds.shortcode;

      const timestamp = getMpesaTimestamp();
      const password = Buffer.from(`${creds.shortcode}${creds.passkey}${timestamp}`).toString('base64');
      const token = await getDarajaAccessToken(creds.environment, creds.consumer_key, creds.consumer_secret);

      const forwardedHost = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
      const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(forwardedHost);
      const originHeader = req.get('origin')?.trim().replace(/\/$/, '');
      const isHttpsOrigin = Boolean(originHeader && originHeader.startsWith('https://'));
      const callbackUrl =
        process.env.MPESA_CALLBACK_URL?.trim() ||
        (forwardedHost && !isLocalHost
          ? `https://${forwardedHost}/api/stk-callback`
          : isHttpsOrigin
            ? `${originHeader}/api/stk-callback`
            : 'https://example.com/api/stk-callback');

      const accountReference =
        (businessName || cleanedIdentifier || 'POS26')
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
            TransactionDesc: `${businessName || 'POS26'} Sale`.slice(0, 30),
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
        res.status(502).json({
          error:
            result.errorMessage ||
            result.ResponseDescription ||
            'Safaricom Daraja could not initiate the M-Pesa STK Push. Contact your POS26 platform administrator to verify the shortcode and Daraja credentials.',
        });
        return;
      }

      stkTransactions.set(result.CheckoutRequestID, {
        checkoutRequestId: result.CheckoutRequestID,
        merchantRequestId: result.MerchantRequestID,
        status: 'pending',
        phone: normalizedPhone,
        amount: numericAmount,
        businessId: businessId ?? '',
        paymentMethod: method,
        paymentIdentifier: partyB,
        createdAt: new Date().toISOString(),
      });

      res.json({
        success: true,
        provider: 'daraja',
        checkoutRequestId: result.CheckoutRequestID,
        merchantRequestId: result.MerchantRequestID,
        reference: result.CheckoutRequestID,
        customerMessage:
          result.CustomerMessage ||
          `M-Pesa prompt sent to ${phone} for ${businessName || 'your business'} (${method.toUpperCase()} ${partyB}).`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initiate M-Pesa STK Push.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/stk-callback', (req, res) => {
    const callback = req.body?.Body?.stkCallback;
    if (callback?.CheckoutRequestID) {
      const existing = stkTransactions.get(callback.CheckoutRequestID);
      const items: Array<{ Name: string; Value?: unknown }> =
        callback.CallbackMetadata?.Item ?? [];
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
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  app.get('/api/stk-status/:checkoutRequestId', (req, res) => {
    const tx = stkTransactions.get(req.params.checkoutRequestId);
    if (!tx) {
      res.status(404).json({ error: 'STK Push transaction not found.' });
      return;
    }
    res.json(tx);
  });

  // Paystack transaction verification & webhook (used for POS26 platform subscriptions)
  app.get('/api/paystack/verify/:reference', async (req, res) => {
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
    if (!paystackSecretKey) {
      res.status(503).json({ error: 'PAYSTACK_SECRET_KEY is not configured on the server.' });
      return;
    }

    try {
      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(req.params.reference)}`,
        { headers: { Authorization: `Bearer ${paystackSecretKey}` } },
      );
      const result = (await response.json().catch(() => ({}))) as {
        status?: boolean;
        message?: string;
        data?: { status?: string; reference?: string; amount?: number; gateway_response?: string };
      };
      if (!response.ok || !result.status || !result.data) {
        res.status(502).json({ error: result.message || 'Could not verify Paystack transaction.' });
        return;
      }
      res.json({
        reference: result.data.reference,
        status: result.data.status,
        amountKes: typeof result.data.amount === 'number' ? result.data.amount / 100 : undefined,
        gatewayResponse: result.data.gateway_response,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Verification failed.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/paystack/webhook', (req, res) => {
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
    const signature = req.headers['x-paystack-signature'];
    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;

    if (paystackSecretKey && typeof signature === 'string' && rawBody) {
      const hash = crypto.createHmac('sha512', paystackSecretKey).update(rawBody).digest('hex');
      if (hash !== signature) {
        res.status(401).json({ error: 'Invalid Paystack signature.' });
        return;
      }
    }

    res.sendStatus(200);
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
