export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type Empty = { [_ in never]: never };

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        { id: string; display_name: string | null; created_at: string },
        { id: string; display_name?: string | null; created_at?: string },
        { display_name?: string | null }
      >;
      businesses: Table<
        {
          id: string;
          name: string;
          currency_code: 'KES';
          tax_rate: number;
          payment_method: 'till' | 'paybill' | 'pochi' | 'phone' | null;
          payment_identifier: string | null;
          created_at: string;
          updated_at: string;
        },
        { name: string; payment_method?: 'till' | 'paybill' | 'pochi' | 'phone' | null; payment_identifier?: string | null },
        { name?: string; payment_method?: 'till' | 'paybill' | 'pochi' | 'phone' | null; payment_identifier?: string | null }
      >;
      business_members: Table<
        {
          business_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'staff';
          joined_at: string;
        },
        { business_id: string; user_id: string; role: 'owner' | 'admin' | 'staff' },
        { role?: 'owner' | 'admin' | 'staff' }
      >;
      products: Table<
        {
          id: string;
          business_id: string;
          sku: string | null;
          name: string;
          category: string | null;
          price: number;
          stock_quantity: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          business_id: string;
          sku?: string | null;
          name: string;
          category?: string | null;
          price: number;
          is_active?: boolean;
        },
        {
          sku?: string | null;
          name?: string;
          category?: string | null;
          price?: number;
          is_active?: boolean;
        }
      >;
      customers: Table<
        {
          id: string;
          business_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          business_id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          notes?: string | null;
        },
        {
          name?: string;
          phone?: string | null;
          email?: string | null;
          notes?: string | null;
        }
      >;
      sales: Table<
        {
          id: string;
          business_id: string;
          receipt_number: string;
          customer_id: string | null;
          created_by: string;
          status: 'completed' | 'refunded';
          payment_method: 'mpesa';
          mpesa_reference: string | null;
          customer_phone: string | null;
          subtotal: number;
          tax: number;
          total: number;
          created_at: string;
          refunded_at: string | null;
        },
        never,
        never
      >;
      sale_items: Table<
        {
          id: string;
          business_id: string;
          sale_id: string;
          product_id: string;
          product_name: string;
          quantity: number;
          unit_price: number;
          line_total: number;
        },
        never,
        never
      >;
      inventory_movements: Table<
        {
          id: string;
          business_id: string;
          product_id: string;
          movement_type: 'adjustment' | 'sale' | 'refund';
          quantity_delta: number;
          reason: string;
          sale_id: string | null;
          created_by: string;
          created_at: string;
        },
        never,
        never
      >;
      cash_sessions: Table<
        {
          id: string;
          business_id: string;
          opened_by: string;
          opened_at: string;
          opening_float: number;
          closed_by: string | null;
          closed_at: string | null;
          closing_count: number | null;
          notes: string | null;
        },
        never,
        never
      >;
      cash_movements: Table<
        {
          id: string;
          business_id: string;
          session_id: string;
          movement_type: 'paid_in' | 'paid_out';
          amount: number;
          reason: string;
          created_by: string;
          created_at: string;
        },
        never,
        never
      >;
      platform_admins: Table<
        { user_id: string; granted_at: string },
        { user_id: string },
        never
      >;
      business_subscriptions: Table<
        {
          business_id: string;
          provider: 'mpesa' | 'paystack';
          billing_interval: 'monthly' | 'yearly';
          status: 'active' | 'past_due' | 'cancelled';
          current_period_start: string;
          current_period_end: string;
          provider_subscription_id: string | null;
          provider_customer_id: string | null;
          updated_at: string;
        },
        {
          business_id: string;
          provider: 'mpesa' | 'paystack';
          billing_interval: 'monthly' | 'yearly';
          status?: 'active' | 'past_due' | 'cancelled';
          current_period_start?: string;
          current_period_end?: string;
          provider_subscription_id?: string | null;
          provider_customer_id?: string | null;
          updated_at?: string;
        },
        {
          provider?: 'mpesa' | 'paystack';
          billing_interval?: 'monthly' | 'yearly';
          status?: 'active' | 'past_due' | 'cancelled';
          current_period_start?: string;
          current_period_end?: string;
          provider_subscription_id?: string | null;
          provider_customer_id?: string | null;
          updated_at?: string;
        }
      >;
      subscription_checkouts: Table<
        {
          id: string;
          business_id: string;
          requested_by: string;
          provider: 'mpesa' | 'paystack';
          billing_interval: 'monthly' | 'yearly';
          amount_kes: number;
          customer_email: string;
          provider_reference: string;
          provider_checkout_id: string | null;
          status: 'pending' | 'succeeded' | 'failed';
          created_at: string;
          paid_at: string | null;
        },
        never,
        never
      >;
      subscription_payments: Table<
        {
          id: string;
          business_id: string;
          provider: 'mpesa' | 'paystack';
          provider_reference: string;
          amount_kes: number;
          paid_at: string;
          created_at: string;
        },
        never,
        never
      >;
    };
    Views: Empty;
    Functions: {
      is_business_member: {
        Args: { p_business_id: string };
        Returns: boolean;
      };
      has_business_role: {
        Args: { p_business_id: string; p_roles: string[] };
        Returns: boolean;
      };
      create_business: {
        Args: { p_name: string };
        Returns: string;
      };
      adjust_inventory: {
        Args: {
          p_business_id: string;
          p_product_id: string;
          p_quantity_delta: number;
          p_reason: string;
        };
        Returns: undefined;
      };
      create_sale: {
        Args: {
          p_business_id: string;
          p_customer_id: string | null;
          p_items: Json;
          p_mpesa_reference: string | null;
          p_customer_phone: string | null;
        };
        Returns: { sale_id: string; receipt_number: string; sale_total: number }[];
      };
      refund_sale: {
        Args: { p_sale_id: string };
        Returns: undefined;
      };
      open_cash_session: {
        Args: { p_business_id: string; p_opening_float?: number; p_notes?: string | null };
        Returns: string;
      };
      close_cash_session: {
        Args: { p_session_id: string; p_closing_count: number; p_notes?: string | null };
        Returns: undefined;
      };
      add_cash_movement: {
        Args: {
          p_session_id: string;
          p_movement_type: 'paid_in' | 'paid_out';
          p_amount: number;
          p_reason: string;
        };
        Returns: string;
      };
      is_platform_admin: {
        Args: Empty;
        Returns: boolean;
      };
      get_platform_overview: {
        Args: Empty;
        Returns: { total_businesses: number; subscribed_businesses: number }[];
      };
      get_platform_businesses: {
        Args: Empty;
        Returns: {
          id: string;
          name: string;
          payment_method: string | null;
          payment_identifier: string | null;
          subscription_status: string;
          mpesa_configured: boolean;
          mpesa_environment: 'sandbox' | 'production' | null;
          mpesa_shortcode: string | null;
          mpesa_consumer_key: string | null;
        }[];
      };
      get_business_subscription: {
        Args: { p_business_id: string };
        Returns: {
          provider: string;
          billing_interval: string;
          status: string;
          current_period_end: string;
        }[];
      };
      record_subscription_payment: {
        Args: {
          p_checkout_id?: string | null;
          p_provider_reference: string;
          p_amount_kes: number;
          p_paid_at: string;
          p_provider_subscription_id?: string | null;
          p_provider_customer_id?: string | null;
          p_business_id?: string | null;
        };
        Returns: boolean;
      };
      activate_business_subscription: {
        Args: {
          p_business_id: string;
          p_billing_interval: 'monthly' | 'yearly';
          p_provider_reference: string;
          p_amount_kes: number;
        };
        Returns: string;
      };
      save_business_mpesa_credentials: {
        Args: {
          p_business_id: string;
          p_environment: 'sandbox' | 'production';
          p_shortcode: string;
          p_consumer_key: string;
          p_consumer_secret?: string | null;
          p_passkey?: string | null;
        };
        Returns: undefined;
      };
      get_business_mpesa_status: {
        Args: { p_business_id: string };
        Returns: {
          configured: boolean;
          environment: 'sandbox' | 'production';
          shortcode: string;
          consumer_key: string;
        }[];
      };
      get_business_mpesa_credentials: {
        Args: { p_business_id: string };
        Returns: {
          environment: 'sandbox' | 'production';
          shortcode: string;
          consumer_key: string;
          consumer_secret: string;
          passkey: string;
        }[];
      };
    };
    Enums: Empty;
    CompositeTypes: Empty;
  };
};
