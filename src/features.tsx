import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Archive,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  CircleHelp,
  ClipboardList,
  CreditCard,
  Download,
  LogOut,
  Package,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { EmptyState, Modal, PageHeading, SalesTable, StatCard } from './components';
import type {
  AppView,
  Business,
  BusinessRole,
  CartLine,
  Customer,
  Product,
  Sale,
  WorkspaceData,
} from './app.types';
import { formatDate, formatMoney, formatQuantity } from './format';
import { isUsingMockDatabase, supabase, supabaseConfig } from './lib/supabase';
import { BillingPanel } from './BillingPanel';

function getClient() {
  if (!supabase) throw new Error('Database connection is unavailable.');
  return supabase;
}

type Props = {
  business: Business;
  role: BusinessRole;
  data: WorkspaceData;
  view: AppView;
  cart: CartLine[];
  setCart: (cart: CartLine[] | ((current: CartLine[]) => CartLine[])) => void;
  selectedCustomer: string;
  setSelectedCustomer: (customerId: string) => void;
  mpesaReference: string;
  setMpesaReference: (reference: string) => void;
  onNavigate: (view: AppView) => void;
  onRunAction: (action: () => Promise<void>, success: string) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  onBusinessUpdated: (business: Business) => void;
  onSubscriptionUpdated?: () => Promise<void>;
  sessionEmail: string;
  onSignOut: () => Promise<void>;
};

export function FeaturePage(props: Props) {
  switch (props.view) {
    case 'pos': return <PosPage {...props} />;
    case 'orders': return <OrdersPage {...props} />;
    case 'products': return <ProductsPage {...props} />;
    case 'inventory': return <InventoryPage {...props} />;
    case 'customers': return <CustomersPage {...props} />;
    case 'cash': return <CashPage {...props} />;
    case 'reports': return <ReportsPage {...props} />;
    case 'settings': return <SettingsPage {...props} />;
    default: return <DashboardPage {...props} />;
  }
}

function DashboardPage(props: Props) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todaySales = props.data.sales.filter(
    (sale) => sale.status === 'completed' && new Date(sale.created_at) >= startOfDay,
  );
  const revenueToday = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const activeProducts = props.data.products.filter((product) => product.is_active);
  const lowStock = activeProducts.filter((product) => product.stock_quantity <= 5).length;
  const firstDay = props.data.products.length === 0 && props.data.sales.length === 0;

  return (
    <>
      <PageHeading
        eyebrow="YOUR BUSINESS AT A GLANCE"
        title="Dashboard"
        description={`Welcome to ${props.business.name}. Here is your business overview for today.`}
        action={<button className="primary-button" type="button" onClick={() => props.onNavigate('pos')}><ShoppingBag size={17} /> Start a sale</button>}
      />
      {firstDay && (
        <section className="welcome-panel">
          <div className="welcome-copy">
            <span className="welcome-tag"><span /> YOUR WORKSPACE IS READY</span>
            <h2>Build your business, one sale at a time.</h2>
            <p>Add your products, set opening stock, and start recording M-Pesa sales. Your dashboard updates as your team works.</p>
            <button className="welcome-action" type="button" onClick={() => props.onNavigate('products')}>Add your first product <ArrowRight size={17} /></button>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="art-ring art-ring-one" /><div className="art-ring art-ring-two" />
            <div className="art-card"><span className="art-card-label">YOUR BUSINESS</span><span className="art-card-line art-card-line-long" /><span className="art-card-line art-card-line-short" /><span className="art-card-icon"><ShoppingBag size={23} /></span></div>
            <span className="art-spark art-spark-one">✳</span><span className="art-spark art-spark-two">✦</span>
          </div>
        </section>
      )}
      <section className="stats-grid" aria-label="Business metrics">
        <StatCard label="Sales today" value={formatMoney(revenueToday)} note={`${todaySales.length} completed transactions`} icon={CreditCard} />
        <StatCard label="Orders today" value={String(todaySales.length)} note="Recorded through the POS" icon={ClipboardList} tone="blue" />
        <StatCard label="Active products" value={String(activeProducts.length)} note={`${lowStock} low-stock items`} icon={Package} tone={lowStock ? 'amber' : 'green'} />
        <StatCard label="Customers" value={String(props.data.customers.length)} note="In your customer book" icon={Users} tone="blue" />
      </section>
      <div className="dashboard-lower">
        <section className="panel">
          <div className="panel-heading"><div><h3>Recent sales</h3><p>Your latest transactions</p></div><button className="text-button" type="button" onClick={() => props.onNavigate('orders')}>View all <ArrowRight size={15} /></button></div>
          <SalesTable sales={props.data.sales.slice(0, 5)} customers={props.data.customers} compact />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h3>Quick actions</h3><p>Keep your day moving</p></div></div>
          <div className="quick-actions">
            <QuickAction icon={<ShoppingCart size={18} />} title="New sale" detail="Open the point of sale" onClick={() => props.onNavigate('pos')} />
            <QuickAction icon={<Plus size={18} />} title="Add a product" detail="Grow your catalogue" onClick={() => props.onNavigate('products')} />
            <QuickAction icon={<Boxes size={18} />} title="Adjust stock" detail="Record incoming or counted stock" onClick={() => props.onNavigate('inventory')} />
            <QuickAction icon={<UserRound size={18} />} title="Add a customer" detail="Save a customer profile" onClick={() => props.onNavigate('customers')} />
          </div>
        </section>
      </div>
      <section className="panel low-stock-panel">
        <div className="panel-heading"><div><h3>Stock to review</h3><p>Active products with five or fewer units</p></div><button className="text-button" type="button" onClick={() => props.onNavigate('inventory')}>Open inventory <ArrowRight size={15} /></button></div>
        {!lowStock ? <div className="inline-empty"><Check size={17} /> All active products are above the low-stock threshold.</div> : (
          <div className="low-stock-list">{activeProducts.filter((product) => product.stock_quantity <= 5).slice(0, 5).map((product) => <div className="low-stock-item" key={product.id}><span className="product-initial">{product.name.slice(0, 1).toUpperCase()}</span><strong>{product.name}</strong><span className="stock-warning">{formatQuantity(product.stock_quantity)} left</span></div>)}</div>
        )}
      </section>
    </>
  );
}

function QuickAction({ icon, title, detail, onClick }: { icon: ReactNode; title: string; detail: string; onClick: () => void }) {
  return <button type="button" onClick={onClick}><span className="quick-icon">{icon}</span><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={16} /></button>;
}

function ProductsPage(props: Props) {
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const canManage = props.role !== 'staff';
  const products = props.data.products.filter((product) => {
    if (!showArchived && !product.is_active) return false;
    return `${product.name} ${product.sku ?? ''} ${product.category ?? ''}`.toLowerCase().includes(query.toLowerCase());
  });

  const save = async (values: Pick<Product, 'name' | 'sku' | 'category' | 'price'>) => {
    const success = await props.onRunAction(async () => {
      const client = getClient();
      const { error } = editing
        ? await client.from('products').update(values).eq('id', editing.id).eq('business_id', props.business.id)
        : await client.from('products').insert({ ...values, business_id: props.business.id });
      if (error) throw error;
      await props.onRefresh();
    }, editing ? 'Product updated.' : 'Product added.');
    if (success) setEditing(undefined);
  };

  return (
    <>
      <PageHeading eyebrow="CATALOGUE" title="Products" description="Manage the products and prices available at checkout." action={canManage ? <button className="primary-button" type="button" onClick={() => setEditing(null)}><Plus size={17} /> Add product</button> : undefined} />
      <section className="panel data-panel">
        <div className="toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Search products, SKU or category" />
          {canManage && <button type="button" className={`filter-button${showArchived ? ' selected' : ''}`} onClick={() => setShowArchived(!showArchived)}><Archive size={16} /> {showArchived ? 'Show active only' : 'Include archived'}</button>}
        </div>
        {!products.length ? (
          <EmptyState icon={<Package size={22} />} title={query ? 'No matching products' : 'Your catalogue is ready to build'} description={query ? 'Try another product name, SKU or category.' : 'Add your first product so your team can start recording sales.'} action={canManage && !query ? <button className="text-button" type="button" onClick={() => setEditing(null)}>Add a product <ArrowRight size={15} /></button> : undefined} />
        ) : (
          <div className="table-scroll"><table>
            <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Stock</th><th className="align-right">Price</th><th>Status</th>{canManage && <th />}</tr></thead>
            <tbody>{products.map((product) => <tr key={product.id}>
              <td><span className="product-cell"><span className="product-initial">{product.name.slice(0, 1).toUpperCase()}</span><strong>{product.name}</strong></span></td>
              <td>{product.sku || '—'}</td><td>{product.category || 'Uncategorised'}</td>
              <td><span className={product.stock_quantity <= 5 && product.is_active ? 'stock-warning' : ''}>{formatQuantity(product.stock_quantity)} units</span></td>
              <td className="align-right amount-cell">{formatMoney(product.price)}</td>
              <td><span className={`status-pill ${product.is_active ? 'completed' : 'refunded'}`}>{product.is_active ? 'Active' : 'Archived'}</span></td>
              {canManage && <td className="row-actions">
                <button className="text-button compact-button" type="button" onClick={() => setEditing(product)}>Edit</button>
                <button className="icon-button" type="button" aria-label={product.is_active ? `Archive ${product.name}` : `Restore ${product.name}`} onClick={() => void props.onRunAction(async () => {
                  const client = getClient();
                  const { error } = await client.from('products').update({ is_active: !product.is_active }).eq('id', product.id).eq('business_id', props.business.id);
                  if (error) throw error;
                  await props.onRefresh();
                }, product.is_active ? 'Product archived.' : 'Product restored.')}><Archive size={15} /></button>
              </td>}
            </tr>)}</tbody>
          </table></div>
        )}
      </section>
      {editing !== undefined && <ProductForm product={editing} onClose={() => setEditing(undefined)} onSave={save} />}
    </>
  );
}

function ProductForm({
  product,
  onClose,
  onSave,
}: {
  product: Product | null;
  onClose: () => void;
  onSave: (values: Pick<Product, 'name' | 'sku' | 'category' | 'price'>) => Promise<void>;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    await onSave({ name: name.trim(), sku: sku.trim() || null, category: category.trim() || null, price: Number(price) });
    setBusy(false);
  };
  return (
    <Modal title={product ? 'Edit product' : 'Add a product'} onClose={onClose}>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <label className="field"><span>Product name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} /></label>
        <div className="form-row">
          <label className="field"><span>SKU <small>Optional</small></span><input value={sku} onChange={(event) => setSku(event.target.value)} maxLength={80} /></label>
          <label className="field"><span>Category <small>Optional</small></span><input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={80} /></label>
        </div>
        <label className="field"><span>Price (KES)</span><input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
        <p className="field-help">Opening stock is recorded separately in Inventory so every stock change is traceable.</p>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : product ? 'Save changes' : 'Add product'}</button></div>
      </form>
    </Modal>
  );
}

function CustomersPage(props: Props) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Customer | null | undefined>(undefined);
  const customers = props.data.customers.filter((customer) =>
    `${customer.name} ${customer.email ?? ''} ${customer.phone ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  const save = async (values: Pick<Customer, 'name' | 'phone' | 'email' | 'notes'>) => {
    const success = await props.onRunAction(async () => {
      const client = getClient();
      const { error } = editing
        ? await client.from('customers').update(values).eq('id', editing.id).eq('business_id', props.business.id)
        : await client.from('customers').insert({ ...values, business_id: props.business.id });
      if (error) throw error;
      await props.onRefresh();
    }, editing ? 'Customer updated.' : 'Customer added.');
    if (success) setEditing(undefined);
  };
  const customerSales = (customerId: string) => props.data.sales.filter(
    (sale) => sale.customer_id === customerId && sale.status === 'completed',
  );

  return (
    <>
      <PageHeading eyebrow="CUSTOMER RELATIONSHIPS" title="Customers" description="Keep customer contact details and purchase history together." action={<button className="primary-button" type="button" onClick={() => setEditing(null)}><Plus size={17} /> Add customer</button>} />
      <section className="panel data-panel">
        <div className="toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search name, phone or email" /><span className="toolbar-count">{props.data.customers.length} customers</span></div>
        {!customers.length ? <EmptyState icon={<Users size={22} />} title={query ? 'No matching customers' : 'Start building your customer book'} description={query ? 'Try a different search.' : 'Save customer details during checkout or add them here.'} action={!query ? <button className="text-button" type="button" onClick={() => setEditing(null)}>Add a customer <ArrowRight size={15} /></button> : undefined} /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>Customer</th><th>Phone</th><th>Email</th><th>Orders (12 mo)</th><th className="align-right">Sales (12 mo)</th><th /></tr></thead>
            <tbody>{customers.map((customer) => {
              const sales = customerSales(customer.id);
              return <tr key={customer.id}>
                <td><span className="product-cell"><span className="product-initial">{customer.name.slice(0, 1).toUpperCase()}</span><strong>{customer.name}</strong></span></td>
                <td>{customer.phone || '—'}</td><td>{customer.email || '—'}</td>                <td>{sales.length}</td>
                <td className="align-right amount-cell">{formatMoney(sales.reduce((sum, sale) => sum + sale.total, 0))}</td>
                <td><button className="text-button compact-button" type="button" onClick={() => setEditing(customer)}>Edit</button></td>
              </tr>;
            })}</tbody>
          </table></div>
        )}
      </section>
      {editing !== undefined && <CustomerForm customer={editing} onClose={() => setEditing(undefined)} onSave={save} />}
    </>
  );
}

function CustomerForm({
  customer,
  onClose,
  onSave,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSave: (values: Pick<Customer, 'name' | 'phone' | 'email' | 'notes'>) => Promise<void>;
}) {
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    await onSave({ name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, notes: notes.trim() || null });
    setBusy(false);
  };
  return (
    <Modal title={customer ? 'Edit customer' : 'Add a customer'} onClose={onClose}>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <label className="field"><span>Full name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required /></label>
        <label className="field"><span>Phone number <small>Optional</small></span><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} /></label>
        <label className="field"><span>Email address <small>Optional</small></span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} /></label>
        <label className="field"><span>Notes <small>Optional</small></span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} /></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : customer ? 'Save changes' : 'Add customer'}</button></div>
      </form>
    </Modal>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="search-field"><Search size={17} aria-hidden="true" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function InventoryPage(props: Props) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [direction, setDirection] = useState<'receive' | 'remove'>('receive');
  const [reason, setReason] = useState('');
  const activeProducts = props.data.products.filter((product) => product.is_active);
  const canManage = props.role !== 'staff';
  const selectedProduct = activeProducts.find((product) => product.id === productId);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!productId) return;
    const delta = Number(quantity) * (direction === 'receive' ? 1 : -1);
    const success = await props.onRunAction(async () => {
      const { error } = await getClient().rpc('adjust_inventory', {
        p_business_id: props.business.id,
        p_product_id: productId,
        p_quantity_delta: delta,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      await props.onRefresh();
    }, 'Stock adjustment recorded.');
    if (success) {
      setQuantity('');
      setReason('');
    }
  };

  return (
    <>
      <PageHeading eyebrow="STOCK CONTROL" title="Inventory" description="Keep stock levels accurate and maintain a clear movement history." />
      <div className="inventory-summary">
        <StatCard label="Active products" value={String(activeProducts.length)} note="Available for sale" icon={Package} />
        <StatCard label="Units on hand" value={formatQuantity(activeProducts.reduce((sum, product) => sum + product.stock_quantity, 0))} note="Across active products" icon={Boxes} tone="blue" />
        <StatCard label="Low-stock items" value={String(activeProducts.filter((product) => product.stock_quantity <= 5).length)} note="Five units or fewer" icon={ArrowDownRight} tone="amber" />
      </div>
      <div className="inventory-layout">
        <section className="panel">
          <div className="panel-heading"><div><h3>Stock levels</h3><p>Current on-hand quantity by product</p></div></div>
          {!activeProducts.length ? <EmptyState icon={<Package size={22} />} title="No active products" description="Add products before managing stock." /> : (
            <div className="table-scroll"><table>
              <thead><tr><th>Product</th><th>SKU</th><th>Stock on hand</th><th>Stock status</th></tr></thead>
              <tbody>{activeProducts.map((product) => <tr key={product.id}>
                <td><strong>{product.name}</strong></td><td>{product.sku || '—'}</td><td>{formatQuantity(product.stock_quantity)} units</td>
                <td><span className={`status-pill ${product.stock_quantity <= 5 ? 'low' : 'completed'}`}>{product.stock_quantity <= 5 ? 'Low stock' : 'In stock'}</span></td>
              </tr>)}</tbody>
            </table></div>
          )}
        </section>
        <div className="inventory-side">
          {canManage && <section className="panel">
            <div className="panel-heading"><div><h3>Adjust stock</h3><p>Record a delivery or stock count</p></div></div>
            {!activeProducts.length ? <p className="muted-copy">Create an active product first.</p> : (
              <form className="form-stack" onSubmit={(event) => void submit(event)}>
                <label className="field"><span>Product</span><select required value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Select a product</option>{activeProducts.map((product) => <option value={product.id} key={product.id}>{product.name} · {formatQuantity(product.stock_quantity)} on hand</option>)}</select></label>
                <label className="field"><span>Adjustment type</span><select value={direction} onChange={(event) => setDirection(event.target.value as 'receive' | 'remove')}><option value="receive">Receive stock</option><option value="remove">Remove / count correction</option></select></label>
                <label className="field"><span>Quantity</span><input type="number" min="0.001" step="0.001" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
                <label className="field"><span>Reason</span><input required maxLength={240} placeholder="e.g. Supplier delivery" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
                {selectedProduct && <p className="field-help">New balance: {formatQuantity(Math.max(0, selectedProduct.stock_quantity + Number(quantity || 0) * (direction === 'receive' ? 1 : -1)))} units</p>}
                <button className="primary-button full-width" type="submit"><ArrowLeftRight size={16} /> Record adjustment</button>
              </form>
            )}
          </section>}
          <section className="panel">
            <div className="panel-heading"><div><h3>Recent movements</h3><p>Latest stock changes</p></div></div>
            {!props.data.inventoryMovements.length ? <p className="muted-copy">Stock receipts, sales and refunds will appear here.</p> : (
              <div className="movement-list">{props.data.inventoryMovements.slice(0, 10).map((movement) => {
                const product = props.data.products.find((item) => item.id === movement.product_id);
                return <div className="movement-row" key={movement.id}>
                  <span className={`movement-sign ${movement.quantity_delta > 0 ? 'positive' : 'negative'}`}>{movement.quantity_delta > 0 ? '+' : ''}{formatQuantity(movement.quantity_delta)}</span>
                  <span><strong>{product?.name ?? 'Product'}</strong><small>{movement.reason}</small></span>
                  <time>{new Intl.DateTimeFormat('en-KE', { dateStyle: 'short' }).format(new Date(movement.created_at))}</time>
                </div>;
              })}</div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function PosPage(props: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All products');
  const [lastReceipt, setLastReceipt] = useState<{ number: string; total: number } | null>(null);
  const [customerPhone, setCustomerPhone] = useState('');
  const categories = ['All products', ...new Set(props.data.products.flatMap((product) => product.is_active && product.category ? [product.category] : []))];
  const products = props.data.products.filter((product) => {
    if (!product.is_active || product.stock_quantity <= 0) return false;
    if (category !== 'All products' && product.category !== category) return false;
    return `${product.name} ${product.sku ?? ''}`.toLowerCase().includes(query.toLowerCase());
  });
  const total = props.cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);

  const addToCart = (product: Product) => {
    setLastReceipt(null);
    props.setCart((current) => {
      const line = current.find((item) => item.product.id === product.id);
      if (line) {
        if (line.quantity >= product.stock_quantity) return current;
        return current.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...current, { product, quantity: 1 }];
    });
  };

  const changeQuantity = (product: Product, quantity: number) => {
    props.setCart((current) => {
      if (quantity <= 0) return current.filter((item) => item.product.id !== product.id);
      if (quantity > product.stock_quantity) return current;
      return current.map((item) => item.product.id === product.id ? { ...item, quantity } : item);
    });
  };

  const checkout = async () => {
    if (!props.cart.length) return;
    const phone = customerPhone.trim();
    let successMessage = 'Sale completed and stock updated.';

    const recordSale = async (referenceOverride?: string) => {
      const ref = props.mpesaReference.trim() || referenceOverride || null;
      const { data: receipts, error } = await getClient().rpc('create_sale', {
        p_business_id: props.business.id,
        p_customer_id: props.selectedCustomer || null,
        p_items: props.cart.map(({ product, quantity }) => ({ product_id: product.id, quantity })),
        p_mpesa_reference: ref,
        p_customer_phone: phone || null,
      });
      if (error) throw error;
      const receipt = receipts?.[0];
      if (!receipt) throw new Error('Checkout completed without returning a receipt.');
      setLastReceipt({ number: receipt.receipt_number, total: receipt.sale_total });
      props.setCart([]);
      props.setSelectedCustomer('');
      props.setMpesaReference('');
      setCustomerPhone('');
      await props.onRefresh();
    };

    const success = await props.onRunAction(async () => {
      let gatewayReference: string | undefined;

      if (phone) {
        const client = getClient();
        const { data: sessionData } = await client.auth.getSession();
        let mockCredentials: Record<string, unknown> | null = null;
        if (isUsingMockDatabase) {
          const { data: mockRows } = await client.rpc('get_business_mpesa_credentials', {
            p_business_id: props.business.id,
          });
          mockCredentials = mockRows?.[0] ?? null;
        }

        const response = await fetch('/api/stk-push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: total,
            phone,
            businessId: props.business.id,
            businessName: props.business.name,
            paymentMethod: props.business.payment_method,
            paymentIdentifier: props.business.payment_identifier,
            accessToken: sessionData.session?.access_token,
            supabaseUrl: supabaseConfig.url,
            supabaseAnonKey: supabaseConfig.anonKey,
            mockCredentials,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          reference?: string;
          customerMessage?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to initiate M-Pesa STK Push.');
        }

        gatewayReference = payload.reference;
        successMessage = payload.customerMessage
          ? `${payload.customerMessage} Sale recorded.`
          : `M-Pesa prompt sent to ${phone} for ${props.business.name}. Sale recorded.`;
      }

      await recordSale(gatewayReference);
    }, successMessage);
    if (success) setQuery('');
  };

  return (
    <>
      <PageHeading eyebrow="CHECKOUT" title="Point of sale" description="Create a sale, select a customer and record the M-Pesa reference." />
      {lastReceipt && <div className="receipt-banner"><span className="receipt-success"><Check size={18} /></span><span><strong>Sale completed</strong><small>Receipt {lastReceipt.number} · {formatMoney(lastReceipt.total)}</small></span><button className="text-button" type="button" onClick={() => props.onNavigate('orders')}>View orders <ArrowRight size={15} /></button></div>}
      <div className="pos-layout">
        <section className="panel product-picker">
          <div className="toolbar">
            <SearchInput value={query} onChange={setQuery} placeholder="Find a product by name or SKU" />
            <label className="select-compact"><span className="sr-only">Filter by category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
          </div>
          {!products.length ? <EmptyState icon={<ShoppingBag size={22} />} title={props.data.products.length ? 'No available products' : 'Add products to start selling'} description={props.data.products.length ? 'Products must be active and have stock on hand to appear at checkout.' : 'Add products and receive opening stock before your first sale.'} action={!props.data.products.length ? <button className="text-button" type="button" onClick={() => props.onNavigate('products')}>Go to products <ArrowRight size={15} /></button> : undefined} /> : (
            <div className="product-grid">{products.map((product) => <button className="pos-product" type="button" key={product.id} onClick={() => addToCart(product)}>
              <span className="pos-product-icon"><ShoppingBag size={20} /></span><strong>{product.name}</strong><span className="pos-product-category">{product.category || product.sku || 'Product'}</span>
              <span className="pos-product-bottom"><strong>{formatMoney(product.price)}</strong><small>{formatQuantity(product.stock_quantity)} in stock</small></span>
            </button>)}</div>
          )}
        </section>
        <aside className="panel cart-panel">
          <div className="panel-heading"><div><h3>Current sale</h3><p>{props.cart.length} line{props.cart.length === 1 ? '' : 's'}</p></div><span className="cart-icon"><ShoppingCart size={18} /></span></div>
          <div className="cart-lines">
            {!props.cart.length ? <div className="cart-empty"><ShoppingCart size={23} /><strong>Your sale is empty</strong><span>Select products to add them here.</span></div> : props.cart.map(({ product, quantity }) => (
              <div className="cart-line" key={product.id}>
                <div className="cart-line-info"><strong>{product.name}</strong><small>{formatMoney(product.price)} each</small></div>
                <div className="quantity-control"><button type="button" aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(product, quantity - 1)}>−</button><span>{formatQuantity(quantity)}</span><button type="button" aria-label={`Add one ${product.name}`} disabled={quantity >= product.stock_quantity} onClick={() => changeQuantity(product, quantity + 1)}>+</button></div>
                <strong className="cart-line-total">{formatMoney(product.price * quantity)}</strong>
              </div>
            ))}
          </div>
          <div className="checkout-fields">
            <label className="field">
              <span>Customer <small>Optional</small></span>
              <select
                value={props.selectedCustomer}
                onChange={(event) => {
                  const nextId = event.target.value;
                  props.setSelectedCustomer(nextId);
                  const chosen = props.data.customers.find((customer) => customer.id === nextId);
                  if (chosen?.phone && !customerPhone.trim()) {
                    setCustomerPhone(chosen.phone);
                  }
                }}
              >
                <option value="">Walk-in customer</option>
                {props.data.customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Customer M-Pesa phone <small>Prompts STK Push</small></span>
              <input type="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} maxLength={20} placeholder="e.g. 0712345678" />
            </label>
            <label className="field"><span>M-Pesa reference <small>Optional</small></span><input value={props.mpesaReference} onChange={(event) => props.setMpesaReference(event.target.value)} maxLength={64} placeholder="e.g. QHX7AB12CD" /></label>
          </div>
          <div className="cart-summary">
            <div><span>Subtotal</span><span>{formatMoney(total)}</span></div><div><span>Tax</span><span>{formatMoney(0)}</span></div>
            <div className="cart-grand-total"><strong>Total due</strong><strong>{formatMoney(total)}</strong></div>
            {props.business.payment_identifier && (
              <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: '0.375rem', marginTop: '1rem', border: '1px solid #bbf7d0', fontSize: '0.875rem' }}>
                <p style={{ margin: 0 }}>Pay to: <strong>{props.business.payment_method?.toUpperCase()} · {props.business.payment_identifier}</strong></p>
              </div>
            )}
            <p className="payment-note">
              <span className="mpesa-mark">M</span>
              {customerPhone.trim()
                ? `Will send STK Push prompt to ${customerPhone.trim()}`
                : 'Enter customer phone to prompt M-Pesa, or confirm manual payment'}
            </p>
            <button type="button" className="primary-button full-width" disabled={!props.cart.length} onClick={() => void checkout()}>
              {customerPhone.trim() ? 'Send M-Pesa Prompt & Complete sale' : 'Complete sale'} <ArrowRight size={17} />
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

function OrdersPage(props: Props) {
  const [status, setStatus] = useState<'all' | 'completed' | 'refunded'>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Sale | null>(null);
  const canRefund = props.role !== 'staff';
  const sales = props.data.sales.filter((sale) => {
    if (status !== 'all' && sale.status !== status) return false;
    const customer = props.data.customers.find((item) => item.id === sale.customer_id);
    return `${sale.receipt_number} ${sale.mpesa_reference ?? ''} ${customer?.name ?? ''}`.toLowerCase().includes(query.toLowerCase());
  });
  const items = selected ? props.data.saleItems.filter((item) => item.sale_id === selected.id) : [];

  const refund = async (sale: Sale) => {
    if (!window.confirm(`Refund ${sale.receipt_number}? This restores stock but does not reverse or return the M-Pesa payment.`)) return;
    await props.onRunAction(async () => {
    const { error } = await getClient().rpc('refund_sale', { p_sale_id: sale.id });
      if (error) throw error;
      setSelected(null);
      await props.onRefresh();
    }, `Sale ${sale.receipt_number} refunded and stock restored.`);
  };

  return (
    <>
      <PageHeading eyebrow="SALES HISTORY" title="Orders" description="Review receipts from the last 12 months, payment references and sale status." action={<button className="primary-button" type="button" onClick={() => props.onNavigate('pos')}><Plus size={17} /> New sale</button>} />
      <section className="panel data-panel">
        <div className="toolbar order-toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Search receipt, customer or M-Pesa reference" />
          <div className="segmented-control" aria-label="Filter orders">
            {(['all', 'completed', 'refunded'] as const).map((item) => <button type="button" className={status === item ? 'selected' : ''} key={item} onClick={() => setStatus(item)}>{item === 'all' ? 'All orders' : item === 'completed' ? 'Completed' : 'Refunded'}</button>)}
          </div>
        </div>
        <SalesTable sales={sales} customers={props.data.customers} />
        {sales.length > 0 && <div className="receipt-quick-list">{sales.slice(0, 5).map((sale) => <button type="button" key={sale.id} onClick={() => setSelected(sale)}>
          <span className="receipt-icon"><ClipboardList size={17} /></span><span><strong>{sale.receipt_number}</strong><small>{props.data.customers.find((customer) => customer.id === sale.customer_id)?.name ?? 'Walk-in customer'} · {formatDate(sale.created_at)}</small></span><strong>{formatMoney(sale.total)}</strong><ArrowRight size={15} />
        </button>)}</div>}
      </section>
      {selected && <Modal title={`Receipt ${selected.receipt_number}`} onClose={() => setSelected(null)}>
        <div className="receipt-details">
          <ReceiptField label="Status"><span className={`status-pill ${selected.status}`}>{selected.status}</span></ReceiptField>
          <ReceiptField label="Date"><strong>{formatDate(selected.created_at)}</strong></ReceiptField>
          <ReceiptField label="Customer"><strong>{props.data.customers.find((item) => item.id === selected.customer_id)?.name ?? 'Walk-in customer'}</strong></ReceiptField>
          <ReceiptField label="Payment"><strong>M-Pesa{selected.mpesa_reference ? ` · ${selected.mpesa_reference}` : ''}</strong></ReceiptField>
          <div className="receipt-items">{items.map((item) => <div key={item.id}><span>{item.product_name} × {formatQuantity(item.quantity)}</span><strong>{formatMoney(item.line_total)}</strong></div>)}</div>
          <div className="receipt-meta receipt-total"><strong>Total</strong><strong>{formatMoney(selected.total)}</strong></div>
          {selected.status === 'refunded' && <p className="field-help">Refunded on {selected.refunded_at ? formatDate(selected.refunded_at) : '—'}. Stock was returned to inventory.</p>}
          {selected.status === 'completed' && canRefund && <button className="danger-button full-width" type="button" onClick={() => void refund(selected)}>Refund sale and restore stock</button>}
        </div>
      </Modal>}
    </>
  );
}

function ReceiptField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="receipt-meta"><span>{label}</span>{children}</div>;
}

function CashPage(props: Props) {
  const [openingFloat, setOpeningFloat] = useState('0');
  const [closingCount, setClosingCount] = useState('');
  const [movementType, setMovementType] = useState<'paid_in' | 'paid_out'>('paid_in');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const openSession = props.data.cashSessions.find((session) => !session.closed_at);
  const movements = openSession ? props.data.cashMovements.filter((item) => item.session_id === openSession.id) : [];
  const expectedCash = openSession ? movements.reduce(
    (total, movement) => total + (movement.movement_type === 'paid_in' ? movement.amount : -movement.amount),
    openSession.opening_float,
  ) : 0;
  const completedSales = props.data.sales.filter((sale) => sale.status === 'completed');
  const mpesaTotal = completedSales.reduce((sum, sale) => sum + sale.total, 0);

  const startSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const success = await props.onRunAction(async () => {
      const { error } = await getClient().rpc('open_cash_session', { p_business_id: props.business.id, p_opening_float: Number(openingFloat) });
      if (error) throw error;
      await props.onRefresh();
    }, 'Cash session opened.');
    if (success) setOpeningFloat('0');
  };

  const addMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!openSession) return;
    const success = await props.onRunAction(async () => {
      const { error } = await getClient().rpc('add_cash_movement', {
        p_session_id: openSession.id,
        p_movement_type: movementType,
        p_amount: Number(movementAmount),
        p_reason: movementReason.trim(),
      });
      if (error) throw error;
      await props.onRefresh();
    }, movementType === 'paid_in' ? 'Cash-in recorded.' : 'Cash-out recorded.');
    if (success) {
      setMovementAmount('');
      setMovementReason('');
    }
  };

  const closeSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!openSession) return;
    const success = await props.onRunAction(async () => {
      const { error } = await getClient().rpc('close_cash_session', { p_session_id: openSession.id, p_closing_count: Number(closingCount) });
      if (error) throw error;
      await props.onRefresh();
    }, 'Cash session closed.');
    if (success) setClosingCount('');
  };

  return (
    <>
      <PageHeading eyebrow="CASH CONTROL" title="Cash management" description="Track opening float, cash movements and end-of-session counts." action={openSession && <span className="status-pill completed"><span className="status-dot" /> Session open</span>} />
      <div className="cash-notice"><span className="mpesa-mark">M</span><p><strong>M-Pesa sales are tracked separately.</strong> The cash drawer includes only opening float and recorded cash-in or cash-out movements.</p></div>
      <div className="cash-summary-grid">
        <StatCard label={openSession ? 'Expected drawer' : 'Latest drawer balance'} value={formatMoney(openSession ? expectedCash : props.data.cashSessions[0]?.closing_count ?? 0)} note={openSession ? 'Opening float + cash movements' : 'Last recorded closing count'} icon={Wallet} />
        <StatCard label="Open session" value={openSession ? 'In progress' : 'Closed'} note={openSession ? `Opened ${formatDate(openSession.opened_at)}` : 'Start a session to track cash'} icon={ClipboardList} tone={openSession ? 'amber' : 'blue'} />
        <StatCard label="Completed M-Pesa sales" value={formatMoney(mpesaTotal)} note={`${completedSales.length} transactions · last 12 months`} icon={CreditCard} tone="blue" />
      </div>
      <div className="cash-layout">
        <section className="panel">
          <div className="panel-heading"><div><h3>{openSession ? 'Current cash session' : 'Start a cash session'}</h3><p>{openSession ? 'Record cash movements or close the drawer.' : 'Count the starting float before your shift begins.'}</p></div></div>
          {openSession ? <div className="cash-session-content">
            <div className="cash-balance"><span>Expected cash on hand</span><strong>{formatMoney(expectedCash)}</strong><small>Based on the opening count and recorded movements</small></div>
            <div className="cash-breakdown">
              <div><span>Opening float</span><strong>{formatMoney(openSession.opening_float)}</strong></div>
              <div><span>Cash paid in</span><strong>{formatMoney(movements.filter((item) => item.movement_type === 'paid_in').reduce((sum, item) => sum + item.amount, 0))}</strong></div>
              <div><span>Cash paid out</span><strong>−{formatMoney(movements.filter((item) => item.movement_type === 'paid_out').reduce((sum, item) => sum + item.amount, 0))}</strong></div>
            </div>
            <form className="inline-form close-session-form" onSubmit={(event) => void closeSession(event)}>
              <label className="field"><span>Counted cash (KES)</span><input type="number" step="0.01" min="0" required value={closingCount} onChange={(event) => setClosingCount(event.target.value)} placeholder="Enter the physical count" /></label>
              <div className="closing-variance"><span>Variance</span><strong className={closingCount && Math.abs(Number(closingCount) - expectedCash) > 0.005 ? 'variance-warning' : ''}>{closingCount ? formatMoney(Number(closingCount) - expectedCash) : '—'}</strong></div>
              <button type="submit" className="secondary-button"><Check size={16} /> Close session</button>
            </form>
          </div> : <form className="form-stack cash-start-form" onSubmit={(event) => void startSession(event)}>
            <label className="field"><span>Opening float (KES)</span><input type="number" step="0.01" min="0" required value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} /></label>
            <p className="field-help">Opening float is the cash physically in the drawer at the start of this session.</p>
            <button type="submit" className="primary-button"><Plus size={16} /> Open cash session</button>
          </form>}
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h3>Record cash movement</h3><p>Document cash added to or removed from the drawer.</p></div></div>
          {!openSession ? <div className="cash-locked"><Wallet size={22} /><strong>Open a cash session first</strong><p>Cash movements are linked to an active session.</p></div> : (
            <form className="form-stack" onSubmit={(event) => void addMovement(event)}>
              <label className="field"><span>Movement</span><select value={movementType} onChange={(event) => setMovementType(event.target.value as 'paid_in' | 'paid_out')}><option value="paid_in">Cash paid in</option><option value="paid_out">Cash paid out</option></select></label>
              <label className="field"><span>Amount (KES)</span><input type="number" min="0.01" step="0.01" required value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} /></label>
              <label className="field"><span>Reason</span><input required maxLength={240} placeholder={movementType === 'paid_in' ? 'e.g. Owner float top-up' : 'e.g. Supplier petty cash'} value={movementReason} onChange={(event) => setMovementReason(event.target.value)} /></label>
              <button type="submit" className="primary-button full-width">Record movement</button>
            </form>
          )}
        </section>
      </div>
      <section className="panel order-recent">
        <div className="panel-heading"><div><h3>Session history</h3><p>Recent cash drawer sessions</p></div></div>
        {!props.data.cashSessions.length ? <EmptyState icon={<Wallet size={22} />} title="No sessions recorded" description="Open a cash session to start tracking drawer movements." /> : (
          <div className="table-scroll"><table><thead><tr><th>Opened</th><th>Opening float</th><th>Closed</th><th>Counted cash</th><th>Status</th></tr></thead>
            <tbody>{props.data.cashSessions.map((item) => <tr key={item.id}><td>{formatDate(item.opened_at)}</td><td>{formatMoney(item.opening_float)}</td><td>{item.closed_at ? formatDate(item.closed_at) : '—'}</td><td>{item.closing_count === null ? '—' : formatMoney(item.closing_count)}</td><td><span className={`status-pill ${item.closed_at ? 'refunded' : 'completed'}`}>{item.closed_at ? 'Closed' : 'Open'}</span></td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}

function ReportsPage(props: Props) {
  const [period, setPeriod] = useState(30);
  const since = new Date();
  since.setDate(since.getDate() - period);
  since.setHours(0, 0, 0, 0);
  const sales = props.data.sales.filter((sale) => new Date(sale.created_at) >= since);
  const completed = sales.filter((sale) => sale.status === 'completed');
  const refunded = sales.filter((sale) => sale.status === 'refunded');
  const totalSales = completed.reduce((sum, sale) => sum + sale.total, 0);
  const averageOrder = completed.length ? totalSales / completed.length : 0;
  const periodStart = since.getTime();
  const bucketCount = Math.min(period, 14);
  const bucketDuration = (Date.now() - periodStart) / bucketCount;
  const bars = Array.from({ length: bucketCount }, (_, index) => {
    const start = periodStart + index * bucketDuration;
    const end = start + bucketDuration;
    const total = completed
      .filter((sale) => {
        const time = new Date(sale.created_at).getTime();
        return time >= start && time < end;
      })
      .reduce((sum, sale) => sum + sale.total, 0);
    return { start, total };
  });
  const maxBar = Math.max(...bars.map((bar) => bar.total), 1);
  const salesById = new Map(sales.map((sale) => [sale.id, sale]));
  const productTotals = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const item of props.data.saleItems) {
    const sale = salesById.get(item.sale_id);
    if (!sale || sale.status !== 'completed') continue;
    const product = productTotals.get(item.product_id) ?? { name: item.product_name, quantity: 0, revenue: 0 };
    product.quantity += item.quantity;
    product.revenue += item.line_total;
    productTotals.set(item.product_id, product);
  }
  const topProducts = [...productTotals.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const inventoryValue = props.data.products.filter((product) => product.is_active)
    .reduce((sum, product) => sum + product.price * product.stock_quantity, 0);

  const exportCsv = () => {
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows: (string | number)[][] = [
      ['Receipt', 'Date', 'Customer', 'Status', 'Payment method', 'M-Pesa reference', 'Total KES'],
      ...sales.map((sale) => [
        sale.receipt_number,
        formatDate(sale.created_at),
        props.data.customers.find((customer) => customer.id === sale.customer_id)?.name ?? 'Walk-in customer',
        sale.status,
        'M-Pesa',
        sale.mpesa_reference ?? '',
        sale.total.toFixed(2),
      ]),
    ];
    const contents = rows.map((row) => row.map(escape).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `pos26-sales-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <>
      <PageHeading eyebrow="BUSINESS PERFORMANCE" title="Reports" description="Review recorded sales, order volume and stock value." action={<button className="secondary-button" type="button" onClick={exportCsv}><Download size={16} /> Export sales CSV</button>} />
      <div className="report-toolbar"><span>Reporting period</span><div className="segmented-control">{[7, 30, 90, 365].map((days) => <button type="button" className={period === days ? 'selected' : ''} key={days} onClick={() => setPeriod(days)}>{days === 365 ? '12 months' : `${days} days`}</button>)}</div></div>
      <div className="stats-grid report-stats">
        <StatCard label="Net sales" value={formatMoney(totalSales)} note="Completed M-Pesa sales" icon={TrendingUp} />
        <StatCard label="Completed orders" value={String(completed.length)} note="In the selected period" icon={ClipboardList} tone="blue" />
        <StatCard label="Average order value" value={formatMoney(averageOrder)} note="Net sales ÷ completed orders" icon={CreditCard} />
        <StatCard label="Refunded sales" value={formatMoney(refunded.reduce((sum, sale) => sum + sale.total, 0))} note={`${refunded.length} refunded orders`} icon={ArrowDownRight} tone="amber" />
      </div>
      <div className="reports-grid">
        <section className="panel chart-panel">
          <div className="panel-heading"><div><h3>Sales trend</h3><p>Completed sales · KES · {period === 365 ? '12 months' : `last ${period} days`}</p></div></div>
          {!completed.length ? <EmptyState icon={<BarChart3 size={22} />} title="No sales in this period" description="Sales performance will appear once transactions have been recorded." /> : (
            <div className="bar-chart" role="img" aria-label="Sales totals across the selected reporting period">
              {bars.map((bar, index) => <div className="bar-column" key={bar.start} title={`${new Date(bar.start).toLocaleDateString()}: ${formatMoney(bar.total)}`}>
                <div className="bar-track"><span style={{ height: `${Math.max(bar.total ? (bar.total / maxBar) * 100 : 0, bar.total ? 4 : 0)}%` }} /></div>
                <small>{index === 0 || index === bars.length - 1 ? new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short' }).format(new Date(bar.start)) : ''}</small>
              </div>)}
            </div>
          )}
        </section>
        <section className="panel inventory-value-panel">
          <div className="panel-heading"><div><h3>Inventory value</h3><p>Active stock at current selling prices</p></div><Boxes size={18} /></div>
          <strong className="inventory-value">{formatMoney(inventoryValue)}</strong>
          <p className="field-help">An indicative retail value, not accounting cost.</p>
          <div className="inventory-value-foot"><span>{props.data.products.filter((product) => product.is_active).length} active products</span><button className="text-button" type="button" onClick={() => props.onNavigate('inventory')}>View stock <ArrowRight size={14} /></button></div>
        </section>
        <section className="panel top-products-panel">
          <div className="panel-heading"><div><h3>Top products</h3><p>Ranked by completed sales revenue</p></div></div>
          {!topProducts.length ? <p className="muted-copy">Product performance will appear after your first sales.</p> : (
            <div className="top-product-list">{topProducts.map((item, index) => <div className="top-product-row" key={item.name}>
              <span className="rank-number">{String(index + 1).padStart(2, '0')}</span><span className="top-product-name"><strong>{item.name}</strong><small>{formatQuantity(item.quantity)} units sold</small></span><strong>{formatMoney(item.revenue)}</strong>
            </div>)}</div>
          )}
        </section>
      </div>
    </>
  );
}

function SettingsPage(props: Props) {
  const [name, setName] = useState(props.business.name);
  const [paymentMethod, setPaymentMethod] = useState(props.business.payment_method ?? 'till');
  const [paymentIdentifier, setPaymentIdentifier] = useState(props.business.payment_identifier ?? '');
  const canManage = props.role !== 'staff';

  useEffect(() => {
    setName(props.business.name);
    setPaymentMethod(props.business.payment_method ?? 'till');
    setPaymentIdentifier(props.business.payment_identifier ?? '');
  }, [props.business.id, props.business.name, props.business.payment_method, props.business.payment_identifier]);

  const dirty = name.trim() !== props.business.name || paymentMethod !== (props.business.payment_method ?? 'till') || paymentIdentifier.trim() !== (props.business.payment_identifier ?? '');
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    const nextName = name.trim();
    const nextMethod = paymentMethod;
    const nextIdentifier = paymentIdentifier.trim();
    const success = await props.onRunAction(async () => {
      const { error } = await getClient().from('businesses').update({ 
        name: nextName,
        payment_method: nextMethod as any,
        payment_identifier: nextIdentifier || null
      }).eq('id', props.business.id);
      if (error) throw error;
      props.onBusinessUpdated({ ...props.business, name: nextName, payment_method: nextMethod as any, payment_identifier: nextIdentifier || null });
    }, 'Business details updated.');
    if (success) {
      setName(nextName);
    }
  };

  return (
    <>
      <PageHeading eyebrow="WORKSPACE PREFERENCES" title="Settings" description="Manage business details, Till or Paybill info, subscription billing and your account." />
      <div className="settings-layout">
        <BillingPanel
          businessId={props.business.id}
          role={props.role}
          onSubscriptionUpdated={props.onSubscriptionUpdated}
        />
        <section className="panel settings-panel">
          <div className="panel-heading"><div><h3>Business details</h3><p>Workspace information and receiving Till or Paybill.</p></div></div>
          <form className="form-stack settings-form" onSubmit={(event) => void save(event)}>
            <label className="field"><span>Business name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required disabled={!canManage} /></label>
            <label className="field">
              <span>Payment method</span>
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as any)} disabled={!canManage}>
                <option value="till">Till Number</option>
                <option value="paybill">Paybill</option>
                <option value="pochi">Pochi la Biashara</option>
                <option value="phone">Phone Number</option>
              </select>
            </label>
            <label className="field"><span>Payment identifier (Till / Paybill / Phone)</span><input value={paymentIdentifier} onChange={(event) => setPaymentIdentifier(event.target.value)} maxLength={120} disabled={!canManage} placeholder="e.g. 123456" /></label>
            <div className="settings-static-row"><span>Business ID</span><code>{props.business.id}</code></div>
            <div className="settings-static-row"><span>Currency</span><strong>{props.business.currency_code} · Kenyan shilling</strong></div>
            {canManage && <button className="primary-button" type="submit" disabled={!dirty}><Check size={16} /> Save business details</button>}
            {!canManage && <p className="field-help">Only a business owner or administrator can edit workspace details.</p>}
          </form>
        </section>

        <section className="panel settings-panel">
          <div className="panel-heading"><div><h3>Your account</h3><p>Signed-in identity and workspace role.</p></div></div>
          <div className="account-summary"><span className="account-avatar">{props.sessionEmail.slice(0, 1).toUpperCase()}</span><span><strong>{props.sessionEmail}</strong><small>{props.role}</small></span></div>
          <div className="security-note"><CircleHelp size={17} /><p>Business data is protected by Supabase row-level security. Team access is scoped to this workspace.</p></div>
          <button type="button" className="secondary-button signout-button" onClick={() => void props.onSignOut()}><LogOut size={16} /> Sign out</button>
        </section>
      </div>
      <section className="panel settings-note"><div className="settings-note-icon"><CircleHelp size={18} /></div><div><h3>M-Pesa checkout & billing</h3><p>Customer M-Pesa prompts use your business&apos;s Till or Paybill settings so payments show your business name and settle directly to you. POS26 subscriptions are billed separately via Paystack.</p></div></section>
    </>
  );
}

