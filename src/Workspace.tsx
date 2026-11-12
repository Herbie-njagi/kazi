import { useState } from 'react';
import {
  BarChart3,
  Boxes,
  Check,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShoppingBag,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { AppView, Business, CartLine, WorkspaceProps } from './app.types';
import { LoadingScreen } from './components';
import { FeaturePage } from './features';

const navigation: { id: AppView; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pos', label: 'Point of sale', icon: ShoppingBag },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'cash', label: 'Cash management', icon: Wallet },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

type Props = WorkspaceProps & {
  businesses: Business[];
  loadingData: boolean;
  errorMessage: string;
  successMessage: string;
  onDismissMessage: () => void;
  onChangeBusiness: (business: Business) => void;
  onRunAction: (action: () => Promise<void>, success: string) => Promise<boolean>;
};

export function Workspace(props: Props) {
  const [view, setView] = useState<AppView>('dashboard');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [mpesaReference, setMpesaReference] = useState('');
  const pageTitle = navigation.find((item) => item.id === view)?.label ?? 'Dashboard';
  const userInitial = (props.sessionEmail[0] ?? 'K').toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#dashboard" onClick={(event) => { event.preventDefault(); setView('dashboard'); }}>
          <span className="brand-mark">P</span>
          <span className="brand-name">POS26</span>
        </a>
        <label className="business-switcher">
          <span className="business-avatar">{props.business.name.slice(0, 1).toUpperCase()}</span>
          <span className="business-name"><strong>{props.business.name}</strong><small>{props.role}</small></span>
          <ChevronDown size={16} aria-hidden="true" />
          <select
            aria-label="Select business"
            value={props.business.id}
            onChange={(event) => {
              const nextBusiness = props.businesses.find((item) => item.id === event.target.value);
              if (nextBusiness) {
                props.onChangeBusiness(nextBusiness);
                setCart([]);
                setSelectedCustomer('');
                setMpesaReference('');
                setView('dashboard');
              }
            }}
          >
            {props.businesses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>

        <nav className="main-nav" aria-label="Business workspace">
          <p className="nav-section-title">WORKSPACE</p>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              className={`nav-link${view === id ? ' active' : ''}`}
              aria-current={view === id ? 'page' : undefined}
              key={id}
              onClick={() => setView(id)}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button type="button" className={`nav-link${view === 'settings' ? ' active' : ''}`} onClick={() => setView('settings')}>
            <Settings size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>Settings</span>
          </button>
          <div className="sidebar-user">
            <span className="user-avatar">{userInitial}</span>
            <span className="user-copy"><strong>{props.sessionEmail}</strong><small>{props.role}</small></span>
            <button type="button" className="icon-button sidebar-signout" aria-label="Sign out" onClick={() => void props.onSignOut()}>
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="sidebar-version">POS26 <span>·</span> KES</p>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="breadcrumb">Workspace <span>/</span> {pageTitle}</p>
            <h1 className="mobile-page-title">{pageTitle}</h1>
          </div>
          <div className="topbar-right">
            <span className="today-label">
              {new Intl.DateTimeFormat('en-KE', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}
            </span>
            <span className="connection-status"><span /> {props.loadingData ? 'Syncing' : 'Connected'}</span>
            <span className="profile-avatar" aria-hidden="true">{userInitial}</span>
          </div>
        </header>

        <div className="page-content">
          {(props.errorMessage || props.successMessage) && (
            <div className={`notice ${props.errorMessage ? 'notice-error' : 'notice-success'}`} role="status">
              {props.errorMessage ? <X size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
              <span>{props.errorMessage || props.successMessage}</span>
              <button type="button" className="icon-button" aria-label="Dismiss message" onClick={props.onDismissMessage}><X size={16} aria-hidden="true" /></button>
            </div>
          )}
          {props.loadingData ? (
            <LoadingScreen label="Loading business data…" compact />
          ) : (
            <FeaturePage
              business={props.business}
              role={props.role}
              data={props.data}
              view={view}
              cart={cart}
              setCart={setCart}
              selectedCustomer={selectedCustomer}
              setSelectedCustomer={setSelectedCustomer}
              mpesaReference={mpesaReference}
              setMpesaReference={setMpesaReference}
              onNavigate={setView}
              onRunAction={props.onRunAction}
              onRefresh={props.onRefresh}
              onBusinessUpdated={props.onBusinessUpdated}
              sessionEmail={props.sessionEmail}
              onSignOut={props.onSignOut}
            />
          )}
        </div>
      </main>
    </div>
  );
}
