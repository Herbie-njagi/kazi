import type { Database } from './lib/database.types';

type TableName = keyof Database['public']['Tables'];
type Row<T extends TableName> = Database['public']['Tables'][T]['Row'];

export type Business = Row<'businesses'>;
export type Product = Row<'products'>;
export type Customer = Row<'customers'>;
export type Sale = Row<'sales'>;
export type SaleItem = Row<'sale_items'>;
export type InventoryMovement = Row<'inventory_movements'>;
export type CashSession = Row<'cash_sessions'>;
export type CashMovement = Row<'cash_movements'>;
export type BusinessRole = 'owner' | 'admin' | 'staff';

export type WorkspaceData = {
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  saleItems: SaleItem[];
  inventoryMovements: InventoryMovement[];
  cashSessions: CashSession[];
  cashMovements: CashMovement[];
};

export type CartLine = { product: Product; quantity: number };
export type AppView =
  | 'dashboard'
  | 'pos'
  | 'orders'
  | 'products'
  | 'inventory'
  | 'customers'
  | 'cash'
  | 'reports'
  | 'settings';

export type WorkspaceProps = {
  business: Business;
  role: BusinessRole;
  data: WorkspaceData;
  onRefresh: () => Promise<void>;
  onBusinessUpdated: (business: Business) => void;
  onSignOut: () => Promise<void>;
  sessionEmail: string;
};
