declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: {
        key: string;
        email: string;
        amount: number;
        currency?: string;
        ref?: string;
        label?: string;
        channels?: string[];
        metadata?: Record<string, unknown>;
        callback: (response: { reference: string; status: string; trans?: string }) => void;
        onClose: () => void;
      }) => { openIframe: () => void };
    };
  }
}

export async function loadPaystackInline(): Promise<boolean> {
  if (window.PaystackPop) return true;
  return new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://js.paystack.co/v1/inline.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.PaystackPop)), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => resolve(Boolean(window.PaystackPop));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
