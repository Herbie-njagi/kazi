export const SUBSCRIPTION_PRICES_KES = {
  monthly: 500,
  yearly: 6000,
} as const;

export type BillingInterval = keyof typeof SUBSCRIPTION_PRICES_KES;
export type PaymentProvider = 'mpesa' | 'paystack';

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function mpesaBaseUrl(): string {
  const environment = requiredEnv('MPESA_ENVIRONMENT');
  if (environment === 'sandbox') return 'https://sandbox.safaricom.co.ke';
  if (environment === 'production') return 'https://api.safaricom.co.ke';
  throw new Error('MPESA_ENVIRONMENT must be sandbox or production.');
}

export async function getMpesaAccessToken(): Promise<string> {
  const key = requiredEnv('MPESA_CONSUMER_KEY');
  const secret = requiredEnv('MPESA_CONSUMER_SECRET');
  const credentials = btoa(`${key}:${secret}`);
  const response = await fetch(
    `${mpesaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } },
  );
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== 'string') {
    throw new Error('Safaricom authentication failed.');
  }
  return result.access_token;
}

export function normalizeMpesaPhone(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Enter a valid M-Pesa phone number.');
  const digits = value.replace(/\D/g, '');
  const normalized = digits.startsWith('0')
    ? `254${digits.slice(1)}`
    : digits.startsWith('254')
      ? digits
      : `254${digits}`;
  if (!/^254[17]\d{8}$/.test(normalized)) {
    throw new Error('Enter a valid Kenyan M-Pesa phone number.');
  }
  return normalized;
}

export function mpesaTimestamp(date = new Date()): string {
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

export async function verifyMpesaCheckout(checkoutRequestId: string): Promise<void> {
  const shortCode = requiredEnv('MPESA_SHORTCODE');
  const passkey = requiredEnv('MPESA_PASSKEY');
  const timestamp = mpesaTimestamp();
  const password = btoa(`${shortCode}${passkey}${timestamp}`);
  const token = await getMpesaAccessToken();
  const response = await fetch(`${mpesaBaseUrl()}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });
  const result = await response.json();
  if (!response.ok || Number(result.ResultCode) !== 0) {
    throw new Error('Safaricom could not verify the M-Pesa payment.');
  }
}
