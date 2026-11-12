import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Minus, ClipboardList } from 'lucide-react';
import type { Customer, Sale } from './app.types';
import { formatDate, formatMoney } from './format';

export function ConfigurationNotice() {
  return (
    <div className="standalone-screen">
      <section className="standalone-card">
        <span className="standalone-brand"><span className="brand-mark">P</span>POS26</span>
        <p className="eyebrow">DATABASE CONNECTION REQUIRED</p>
        <h1>Connect your Supabase project</h1>
        <p>Add your project URL and public anon key to a local <code>.env</code> file, then restart the development server.</p>
        <pre>VITE_SUPABASE_URL=https://your-project.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=your-public-anon-key</pre>
        <p className="fine-print">
          Never put a Supabase service-role key in the browser or commit credentials.
          Apply the migrations in <code>supabase/migrations</code> before signing in.
        </p>
      </section>
    </div>
  );
}

export function LoadingScreen({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={compact ? 'loading-inline' : 'standalone-screen'}>
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="page-description">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'green',
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone?: 'green' | 'amber' | 'blue';
}) {
  return (
    <article className="stat-card">
      <div className="stat-card-top">
        <span className={`stat-icon ${tone}`}><Icon size={18} aria-hidden="true" /></span>
        <Minus className="stat-trend" size={16} aria-hidden="true" />
      </div>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      <p className="stat-note">{note}</p>
    </article>
  );
}

export function SalesTable({
  sales,
  customers,
  compact = false,
}: {
  sales: Sale[];
  customers: Customer[];
  compact?: boolean;
}) {
  if (!sales.length) {
    return (
      <div className="empty-table">
        <span className="empty-icon"><ClipboardList size={21} /></span>
        <strong>No sales recorded yet</strong>
        <p>Your completed POS transactions will appear here.</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>Receipt</th><th>Customer</th><th>Date</th><th>Status</th><th className="align-right">Total</th></tr></thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id}>
              <td><strong className="receipt-number">{sale.receipt_number}</strong></td>
              <td>{customers.find((customer) => customer.id === sale.customer_id)?.name ?? 'Walk-in customer'}</td>
              <td>{compact ? new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(new Date(sale.created_at)) : formatDate(sale.created_at)}</td>
              <td><span className={`status-pill ${sale.status}`}>{sale.status === 'completed' ? 'Completed' : 'Refunded'}</span></td>
              <td className="align-right amount-cell">{formatMoney(sale.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading">
          <div><p className="eyebrow">POS26 WORKSPACE</p><h2 id="modal-title">{title}</h2></div>
          <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}>×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <div className="empty-table"><span className="empty-icon">{icon}</span><strong>{title}</strong><p>{description}</p>{action}</div>;
}
