import type { Session, User } from '@supabase/supabase-js';

export interface MockStore {
  user: User | null;
  session: Session | null;
  businesses: any[];
  business_members: any[];
  products: any[];
  customers: any[];
  sales: any[];
  sale_items: any[];
  inventory_movements: any[];
  cash_sessions: any[];
  cash_movements: any[];
  business_subscriptions: any[];
  business_mpesa_credentials?: any[];
}

const STORAGE_KEY = 'pos26_mock_store_v1';

function createInitialStore(): MockStore {
  const userId = 'usr_demo_001';
  const businessId = 'biz_demo_001';
  const now = new Date();
  const todayIso = now.toISOString();

  const user: User = {
    id: userId,
    app_metadata: {},
    user_metadata: { display_name: 'Demo Merchant' },
    aud: 'authenticated',
    created_at: todayIso,
    email: 'merchant@pos26.ke',
  } as unknown as User;

  const session: Session = {
    access_token: 'mock-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: 'mock-refresh-token',
    user,
  };

  const initialProducts = [
    {
      id: 'prod_1',
      business_id: businessId,
      sku: 'UNG-001',
      name: 'Unga wa Dola Wheat Flour 2kg',
      category: 'Groceries',
      price: 210,
      stock_quantity: 45,
      is_active: true,
      created_at: todayIso,
      updated_at: todayIso,
    },
    {
      id: 'prod_2',
      business_id: businessId,
      sku: 'MLK-002',
      name: 'Brookside Fresh Milk 500ml',
      category: 'Dairy',
      price: 65,
      stock_quantity: 32,
      is_active: true,
      created_at: todayIso,
      updated_at: todayIso,
    },
    {
      id: 'prod_3',
      business_id: businessId,
      sku: 'BRD-003',
      name: 'Broadways Sliced Bread 400g',
      category: 'Bakery',
      price: 60,
      stock_quantity: 18,
      is_active: true,
      created_at: todayIso,
      updated_at: todayIso,
    },
    {
      id: 'prod_4',
      business_id: businessId,
      sku: 'OIL-004',
      name: 'Rina Vegetable Cooking Oil 1L',
      category: 'Groceries',
      price: 320,
      stock_quantity: 4,
      is_active: true,
      created_at: todayIso,
      updated_at: todayIso,
    },
    {
      id: 'prod_5',
      business_id: businessId,
      sku: 'TEA-005',
      name: 'Kericho Gold Pure Tea 100g',
      category: 'Beverages',
      price: 140,
      stock_quantity: 5,
      is_active: true,
      created_at: todayIso,
      updated_at: todayIso,
    },
    {
      id: 'prod_6',
      business_id: businessId,
      sku: 'SGR-006',
      name: 'Mumias Pure Sugar 1kg',
      category: 'Groceries',
      price: 185,
      stock_quantity: 26,
      is_active: true,
      created_at: todayIso,
      updated_at: todayIso,
    },
    {
      id: 'prod_7',
      business_id: businessId,
      sku: 'BEV-007',
      name: 'Keringet Mineral Water 1L',
      category: 'Beverages',
      price: 80,
      stock_quantity: 40,
      is_active: true,
      created_at: todayIso,
      updated_at: todayIso,
    },
  ];

  const initialCustomers = [
    {
      id: 'cust_1',
      business_id: businessId,
      name: 'Wanjiku Kamau',
      phone: '0712345678',
      email: 'wanjiku@pos26.ke',
      notes: 'Prefers morning delivery',
      created_at: todayIso,
      updated_at: todayIso,
    },
    {
      id: 'cust_2',
      business_id: businessId,
      name: 'Otieno Ochieng',
      phone: '0722987654',
      email: 'otieno@pos26.ke',
      notes: 'Weekly wholesale bulk order',
      created_at: todayIso,
      updated_at: todayIso,
    },
    {
      id: 'cust_3',
      business_id: businessId,
      name: 'Amina Mohamed',
      phone: '0733555888',
      email: 'amina@pos26.ke',
      notes: 'Loyal neighborhood customer',
      created_at: todayIso,
      updated_at: todayIso,
    },
  ];

  const initialSessionId = 'cs_demo_001';
  const initialCashSessions = [
    {
      id: initialSessionId,
      business_id: businessId,
      opened_by: userId,
      opened_at: new Date(Date.now() - 4 * 3600000).toISOString(),
      opening_float: 5000,
      closed_by: null,
      closed_at: null,
      closing_count: null,
      notes: 'Morning shift opening float',
    },
  ];

  const initialCashMovements = [
    {
      id: 'cm_1',
      business_id: businessId,
      session_id: initialSessionId,
      movement_type: 'paid_in' as const,
      amount: 1500,
      reason: 'Additional change coins float',
      created_by: userId,
      created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
    },
  ];

  const pastSaleId = 'sale_demo_001';
  const initialSales = [
    {
      id: pastSaleId,
      business_id: businessId,
      receipt_number: 'REC-2601',
      customer_id: 'cust_1',
      created_by: userId,
      status: 'completed' as const,
      payment_method: 'mpesa' as const,
      mpesa_reference: 'QHX8KL91MN',
      subtotal: 595,
      tax: 0,
      total: 595,
      created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
      refunded_at: null,
    },
  ];

  const initialSaleItems = [
    {
      id: 'item_1',
      business_id: businessId,
      sale_id: pastSaleId,
      product_id: 'prod_1',
      product_name: 'Unga wa Dola Wheat Flour 2kg',
      quantity: 1,
      unit_price: 210,
      line_total: 210,
    },
    {
      id: 'item_2',
      business_id: businessId,
      sale_id: pastSaleId,
      product_id: 'prod_2',
      product_name: 'Brookside Fresh Milk 500ml',
      quantity: 1,
      unit_price: 65,
      line_total: 65,
    },
    {
      id: 'item_3',
      business_id: businessId,
      sale_id: pastSaleId,
      product_id: 'prod_4',
      product_name: 'Rina Vegetable Cooking Oil 1L',
      quantity: 1,
      unit_price: 320,
      line_total: 320,
    },
  ];

  const initialMovements = [
    {
      id: 'im_1',
      business_id: businessId,
      product_id: 'prod_1',
      movement_type: 'sale' as const,
      quantity_delta: -1,
      reason: 'Sale REC-2601',
      sale_id: pastSaleId,
      created_by: userId,
      created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
  ];

  return {
    user,
    session,
    businesses: [
      {
        id: businessId,
        name: 'Nairobi Fresh Mart',
        currency_code: 'KES',
        tax_rate: 0,
        payment_method: 'till',
        payment_identifier: '888777',
        created_at: todayIso,
        updated_at: todayIso,
      },
    ],
    business_members: [
      {
        business_id: businessId,
        user_id: userId,
        role: 'owner',
        joined_at: todayIso,
      },
    ],
    products: initialProducts,
    customers: initialCustomers,
    sales: initialSales,
    sale_items: initialSaleItems,
    inventory_movements: initialMovements,
    cash_sessions: initialCashSessions,
    cash_movements: initialCashMovements,
    business_subscriptions: [
      {
        business_id: businessId,
        provider: 'mpesa',
        billing_interval: 'monthly',
        status: 'active',
        current_period_start: todayIso,
        current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
        provider_subscription_id: 'sub_demo_123',
        provider_customer_id: 'cust_demo_123',
        updated_at: todayIso,
      },
    ],
    business_mpesa_credentials: [],
  };
}

function loadStore(): MockStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore storage parse errors
  }
  const initial = createInitialStore();
  saveStore(initial);
  return initial;
}

function saveStore(store: MockStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage errors
  }
}

export function resetMockStore(): MockStore {
  const initial = createInitialStore();
  saveStore(initial);
  return initial;
}

export function createMockSupabaseClient(): any {
  let store = loadStore();
  const listeners: Array<(event: string, session: Session | null) => void> = [];

  function notifyAuth(event: string, session: Session | null) {
    listeners.forEach((listener) => {
      try {
        listener(event, session);
      } catch (err) {
        console.error(err);
      }
    });
  }

  function persist() {
    saveStore(store);
  }

  const auth = {
    async getSession() {
      return { data: { session: store.session }, error: null };
    },
    onAuthStateChange(callback: (event: string, session: Session | null) => void) {
      listeners.push(callback);
      return {
        data: {
          subscription: {
            unsubscribe() {
              const idx = listeners.indexOf(callback);
              if (idx !== -1) listeners.splice(idx, 1);
            },
          },
        },
      };
    },
    async signInWithPassword({ email, password: _password }: { email: string; password?: string }) {
      const trimmedEmail = email.trim().toLowerCase();
      let user = store.user;
      if (!user || user.email?.toLowerCase() !== trimmedEmail) {
        const userId = 'usr_' + Math.random().toString(36).substring(2, 9);
        user = {
          id: userId,
          app_metadata: {},
          user_metadata: { display_name: trimmedEmail.split('@')[0] },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
          email: trimmedEmail,
        } as unknown as User;
        store.user = user;
      }
      const session: Session = {
        access_token: 'mock-access-token-' + Date.now(),
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh-token-' + Date.now(),
        user,
      };
      store.session = session;
      persist();
      notifyAuth('SIGNED_IN', session);
      return { data: { user, session }, error: null };
    },
    async signUp({
      email,
      options,
    }: {
      email: string;
      password?: string;
      options?: { data?: { display_name?: string } };
    }) {
      const trimmedEmail = email.trim().toLowerCase();
      const userId = 'usr_' + Math.random().toString(36).substring(2, 9);
      const user = {
        id: userId,
        app_metadata: {},
        user_metadata: { display_name: options?.data?.display_name || trimmedEmail.split('@')[0] },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        email: trimmedEmail,
      } as unknown as User;
      const session: Session = {
        access_token: 'mock-access-token-' + Date.now(),
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh-token-' + Date.now(),
        user,
      };
      store.user = user;
      store.session = session;
      persist();
      notifyAuth('SIGNED_IN', session);
      return { data: { user, session }, error: null };
    },
    async signOut() {
      store.session = null;
      persist();
      notifyAuth('SIGNED_OUT', null);
      return { error: null };
    },
  };

  async function rpc(fn: string, params: Record<string, any> = {}) {
    store = loadStore();

    switch (fn) {
      case 'is_platform_admin': {
        const email = store.user?.email?.toLowerCase() ?? '';
        const isAdmin = email === 'admin@pos26.ke' || email === 'herbietrade@gmail.com' || email.includes('admin') || email.includes('herbietrade');
        return { data: isAdmin, error: null };
      }
      case 'get_platform_overview': {
        const now = Date.now();
        const activeSubs = store.business_subscriptions.filter(
          (s) => s.status === 'active' && new Date(s.current_period_end).getTime() > now,
        ).length;
        return {
          data: [
            {
              total_businesses: store.businesses.length,
              subscribed_businesses: activeSubs,
            },
          ],
          error: null,
        };
      }
      case 'get_platform_businesses': {
        const now = Date.now();
        const rows = store.businesses.map((biz) => {
          const sub = store.business_subscriptions.find((s) => s.business_id === biz.id);
          const subStatus =
            sub && sub.status === 'active' && new Date(sub.current_period_end).getTime() > now
              ? 'active'
              : sub
                ? 'past_due'
                : 'unsubscribed';
          const creds = (store.business_mpesa_credentials ?? []).find((c) => c.business_id === biz.id);
          return {
            id: biz.id,
            name: biz.name,
            payment_method: biz.payment_method ?? 'till',
            payment_identifier: biz.payment_identifier ?? null,
            subscription_status: subStatus,
            mpesa_configured: Boolean(creds),
            mpesa_environment: creds?.environment ?? null,
            mpesa_shortcode: creds?.shortcode ?? null,
            mpesa_consumer_key: creds?.consumer_key ?? null,
          };
        });
        return { data: rows, error: null };
      }
      case 'create_business': {
        const id = 'biz_' + Math.random().toString(36).substring(2, 9);
        const newBiz = {
          id,
          name: params.p_name,
          currency_code: 'KES',
          tax_rate: 0,
          payment_method: 'till',
          payment_identifier: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        store.businesses.push(newBiz);
        if (store.user?.id) {
          store.business_members.push({
            business_id: id,
            user_id: store.user.id,
            role: 'owner',
            joined_at: new Date().toISOString(),
          });
        }
        persist();
        return { data: id, error: null };
      }
      case 'adjust_inventory': {
        const product = store.products.find((p) => p.id === params.p_product_id);
        if (product) {
          product.stock_quantity = Math.max(0, product.stock_quantity + Number(params.p_quantity_delta));
          product.updated_at = new Date().toISOString();
        }
        store.inventory_movements.unshift({
          id: 'im_' + Math.random().toString(36).substring(2, 9),
          business_id: params.p_business_id,
          product_id: params.p_product_id,
          movement_type: 'adjustment',
          quantity_delta: Number(params.p_quantity_delta),
          reason: params.p_reason,
          sale_id: null,
          created_by: store.user?.id ?? 'usr_demo',
          created_at: new Date().toISOString(),
        });
        persist();
        return { data: null, error: null };
      }
      case 'create_sale': {
        const businessId = params.p_business_id;
        const customerId = params.p_customer_id || null;
        const items = params.p_items as Array<{ product_id: string; quantity: number }>;
        const mpesaRef = params.p_mpesa_reference || null;

        const saleId = 'sale_' + Math.random().toString(36).substring(2, 9);
        const receiptNumber = 'REC-' + (1000 + store.sales.length + 1);

        let subtotal = 0;
        const createdItems: any[] = [];

        for (const item of items) {
          const product = store.products.find((p) => p.id === item.product_id);
          const unitPrice = product ? product.price : 0;
          const lineTotal = unitPrice * item.quantity;
          subtotal += lineTotal;

          if (product) {
            product.stock_quantity = Math.max(0, product.stock_quantity - item.quantity);
            product.updated_at = new Date().toISOString();
          }

          createdItems.push({
            id: 'item_' + Math.random().toString(36).substring(2, 9),
            business_id: businessId,
            sale_id: saleId,
            product_id: item.product_id,
            product_name: product?.name ?? 'Item',
            quantity: item.quantity,
            unit_price: unitPrice,
            line_total: lineTotal,
          });

          store.inventory_movements.unshift({
            id: 'im_' + Math.random().toString(36).substring(2, 9),
            business_id: businessId,
            product_id: item.product_id,
            movement_type: 'sale',
            quantity_delta: -item.quantity,
            reason: `Sale ${receiptNumber}`,
            sale_id: saleId,
            created_by: store.user?.id ?? 'usr_demo',
            created_at: new Date().toISOString(),
          });
        }

        const newSale = {
          id: saleId,
          business_id: businessId,
          receipt_number: receiptNumber,
          customer_id: customerId,
          created_by: store.user?.id ?? 'usr_demo',
          status: 'completed',
          payment_method: 'mpesa',
          mpesa_reference: mpesaRef,
          subtotal,
          tax: 0,
          total: subtotal,
          created_at: new Date().toISOString(),
          refunded_at: null,
        };

        store.sales.unshift(newSale);
        store.sale_items.unshift(...createdItems);
        persist();

        return {
          data: [{ sale_id: saleId, receipt_number: receiptNumber, sale_total: subtotal }],
          error: null,
        };
      }
      case 'refund_sale': {
        const sale = store.sales.find((s) => s.id === params.p_sale_id);
        if (sale && sale.status !== 'refunded') {
          sale.status = 'refunded';
          sale.refunded_at = new Date().toISOString();

          const saleItems = store.sale_items.filter((item) => item.sale_id === sale.id);
          for (const item of saleItems) {
            const product = store.products.find((p) => p.id === item.product_id);
            if (product) {
              product.stock_quantity += item.quantity;
              product.updated_at = new Date().toISOString();
            }
            store.inventory_movements.unshift({
              id: 'im_' + Math.random().toString(36).substring(2, 9),
              business_id: sale.business_id,
              product_id: item.product_id,
              movement_type: 'refund',
              quantity_delta: item.quantity,
              reason: `Refund ${sale.receipt_number}`,
              sale_id: sale.id,
              created_by: store.user?.id ?? 'usr_demo',
              created_at: new Date().toISOString(),
            });
          }
          persist();
        }
        return { data: null, error: null };
      }
      case 'open_cash_session': {
        const sessionId = 'cs_' + Math.random().toString(36).substring(2, 9);
        const session = {
          id: sessionId,
          business_id: params.p_business_id,
          opened_by: store.user?.id ?? 'usr_demo',
          opened_at: new Date().toISOString(),
          opening_float: Number(params.p_opening_float || 0),
          closed_by: null,
          closed_at: null,
          closing_count: null,
          notes: params.p_notes || null,
        };
        store.cash_sessions.unshift(session);
        persist();
        return { data: sessionId, error: null };
      }
      case 'close_cash_session': {
        const session = store.cash_sessions.find((s) => s.id === params.p_session_id);
        if (session) {
          session.closed_by = store.user?.id ?? 'usr_demo';
          session.closed_at = new Date().toISOString();
          session.closing_count = Number(params.p_closing_count || 0);
          if (params.p_notes) session.notes = params.p_notes;
          persist();
        }
        return { data: null, error: null };
      }
      case 'add_cash_movement': {
        const movementId = 'cm_' + Math.random().toString(36).substring(2, 9);
        const openSession = store.cash_sessions.find((s) => s.id === params.p_session_id);
        const movement = {
          id: movementId,
          business_id: openSession?.business_id ?? '',
          session_id: params.p_session_id,
          movement_type: params.p_movement_type,
          amount: Number(params.p_amount),
          reason: params.p_reason,
          created_by: store.user?.id ?? 'usr_demo',
          created_at: new Date().toISOString(),
        };
        store.cash_movements.unshift(movement);
        persist();
        return { data: movementId, error: null };
      }
      case 'get_business_subscription': {
        const sub = store.business_subscriptions.find((s) => s.business_id === params.p_business_id);
        if (!sub) return { data: [], error: null };
        const expired = sub.status === 'active' && new Date(sub.current_period_end).getTime() <= Date.now();
        return {
          data: [{ ...sub, status: expired ? 'past_due' : sub.status }],
          error: null,
        };
      }
      case 'activate_business_subscription':
      case 'record_subscription_payment': {
        const businessId = params.p_business_id || store.businesses[0]?.id || 'biz_demo_001';
        const now = new Date();
        const isYearly = params.p_billing_interval === 'yearly' || Number(params.p_amount_kes) >= 6000;
        const durationDays = isYearly ? 360 : 30;
        const existing = store.business_subscriptions.find((s) => s.business_id === businessId);
        const startMs =
          existing && existing.status === 'active' && new Date(existing.current_period_end).getTime() > now.getTime()
            ? new Date(existing.current_period_end).getTime()
            : now.getTime();
        const periodStart = new Date(startMs);
        const periodEnd = new Date(startMs + durationDays * 86400000);
        if (existing) {
          existing.provider = 'paystack';
          existing.billing_interval = isYearly ? 'yearly' : 'monthly';
          existing.status = 'active';
          existing.current_period_start = periodStart.toISOString();
          existing.current_period_end = periodEnd.toISOString();
          existing.provider_subscription_id = params.p_provider_reference || 'sub_psk_demo';
          existing.updated_at = now.toISOString();
        } else {
          store.business_subscriptions.push({
            business_id: businessId,
            provider: 'paystack',
            billing_interval: isYearly ? 'yearly' : 'monthly',
            status: 'active',
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            provider_subscription_id: params.p_provider_reference || 'sub_psk_demo',
            provider_customer_id: null,
            updated_at: now.toISOString(),
          });
        }
        persist();
        return { data: fn === 'activate_business_subscription' ? periodEnd.toISOString() : true, error: null };
      }
      case 'save_business_mpesa_credentials': {
        if (!store.business_mpesa_credentials) store.business_mpesa_credentials = [];
        const idx = store.business_mpesa_credentials.findIndex((c) => c.business_id === params.p_business_id);
        const existing = idx >= 0 ? store.business_mpesa_credentials[idx] : null;
        const next = {
          business_id: params.p_business_id,
          environment: params.p_environment || 'sandbox',
          shortcode: String(params.p_shortcode || '').trim(),
          consumer_key: String(params.p_consumer_key || '').trim(),
          consumer_secret: String(params.p_consumer_secret || '').trim() || existing?.consumer_secret || '',
          passkey: String(params.p_passkey || '').trim() || existing?.passkey || '',
          updated_at: new Date().toISOString(),
        };
        if (idx >= 0) store.business_mpesa_credentials[idx] = next;
        else store.business_mpesa_credentials.push(next);
        persist();
        return { data: null, error: null };
      }
      case 'get_business_mpesa_status': {
        const creds = (store.business_mpesa_credentials ?? []).find((c) => c.business_id === params.p_business_id);
        return {
          data: creds
            ? [{ configured: true, environment: creds.environment, shortcode: creds.shortcode, consumer_key: creds.consumer_key }]
            : [],
          error: null,
        };
      }
      case 'get_business_mpesa_credentials': {
        const creds = (store.business_mpesa_credentials ?? []).find((c) => c.business_id === params.p_business_id);
        return { data: creds ? [creds] : [], error: null };
      }
      default:
        return { data: null, error: null };
    }
  }

  function from(tableName: string) {
    store = loadStore();

    class QueryBuilder implements PromiseLike<any> {
      private filters: Array<(row: any) => boolean> = [];
      private sortCol: string | null = null;
      private sortAsc: boolean = true;
      private limitCount: number | null = null;
      private isSingle: boolean = false;
      private pendingAction: 'select' | 'insert' | 'update' | 'delete' = 'select';
      private payload: any = null;

      select(_columns = '*') {
        this.pendingAction = 'select';
        return this;
      }

      insert(values: any) {
        this.pendingAction = 'insert';
        this.payload = values;
        return this;
      }

      update(values: any) {
        this.pendingAction = 'update';
        this.payload = values;
        return this;
      }

      delete() {
        this.pendingAction = 'delete';
        return this;
      }

      eq(col: string, val: any) {
        this.filters.push((row) => row[col] === val);
        return this;
      }

      gte(col: string, val: any) {
        this.filters.push((row) => row[col] >= val);
        return this;
      }

      lte(col: string, val: any) {
        this.filters.push((row) => row[col] <= val);
        return this;
      }

      in(col: string, vals: any[]) {
        this.filters.push((row) => vals.includes(row[col]));
        return this;
      }

      order(col: string, opts?: { ascending?: boolean }) {
        this.sortCol = col;
        this.sortAsc = opts?.ascending !== false;
        return this;
      }

      limit(n: number) {
        this.limitCount = n;
        return this;
      }

      single() {
        this.isSingle = true;
        return this;
      }

      private execute() {
        store = loadStore();
        const table = (store as any)[tableName] as any[] | undefined;

        if (!table) {
          return { data: this.isSingle ? null : [], error: null };
        }

        if (this.pendingAction === 'insert') {
          const toInsert = Array.isArray(this.payload) ? this.payload : [this.payload];
          const inserted: any[] = [];
          for (const item of toInsert) {
            const newItem = {
              id: item.id || 'rec_' + Math.random().toString(36).substring(2, 9),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              stock_quantity: item.stock_quantity ?? 0,
              is_active: item.is_active ?? true,
              ...item,
            };
            table.push(newItem);
            inserted.push(newItem);
          }
          persist();
          return { data: this.isSingle ? inserted[0] : inserted, error: null };
        }

        if (this.pendingAction === 'update') {
          const matched = table.filter((row) => this.filters.every((f) => f(row)));
          for (const row of matched) {
            Object.assign(row, this.payload, { updated_at: new Date().toISOString() });
          }
          persist();
          return { data: this.isSingle ? matched[0] : matched, error: null };
        }

        if (this.pendingAction === 'delete') {
          const remaining = table.filter((row) => !this.filters.every((f) => f(row)));
          (store as any)[tableName] = remaining;
          persist();
          return { data: null, error: null };
        }

        // 'select'
        let rows = table.filter((row) => this.filters.every((f) => f(row)));

        if (this.sortCol) {
          const col = this.sortCol;
          const asc = this.sortAsc;
          rows = [...rows].sort((a, b) => {
            const valA = a[col] ?? '';
            const valB = b[col] ?? '';
            if (valA < valB) return asc ? -1 : 1;
            if (valA > valB) return asc ? 1 : -1;
            return 0;
          });
        }

        if (this.limitCount !== null) {
          rows = rows.slice(0, this.limitCount);
        }

        if (this.isSingle) {
          return { data: rows[0] ?? null, error: null };
        }

        return { data: rows, error: null };
      }

      then<TResult1 = any, TResult2 = never>(
        onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
      }
    }

    return new QueryBuilder();
  }

  return {
    auth,
    rpc,
    from,
  };
}
