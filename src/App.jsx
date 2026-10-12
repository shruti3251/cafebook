import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { firebaseConfigured } from './lib/config.js';
import { FullScreenMessage, Spinner } from './components/ui.jsx';
import Landing from './pages/Landing.jsx';
import NotFound from './pages/NotFound.jsx';

// Customer pages
const CustomerLayout = lazy(() => import('./customer/CustomerLayout.jsx'));
const Welcome = lazy(() => import('./customer/Welcome.jsx'));
const Menu = lazy(() => import('./customer/Menu.jsx'));
const Cart = lazy(() => import('./customer/Cart.jsx'));
const OrderSuccess = lazy(() => import('./customer/OrderSuccess.jsx'));
const MyOrders = lazy(() => import('./customer/MyOrders.jsx'));

// Owner dashboard (separate bundle, never downloaded by customers)
const AdminLayout = lazy(() => import('./admin/AdminLayout.jsx'));
const Login = lazy(() => import('./admin/Login.jsx'));
const TablesView = lazy(() => import('./admin/TablesView.jsx'));
const TableDetail = lazy(() => import('./admin/TableDetail.jsx'));
const MenuManager = lazy(() => import('./admin/MenuManager.jsx'));
const OrdersReports = lazy(() => import('./admin/OrdersReports.jsx'));
const Settings = lazy(() => import('./admin/Settings.jsx'));

const Loading = () => (
  <div className="min-h-[100dvh] grid place-items-center"><Spinner size={36} /></div>
);

export default function App() {
  if (!firebaseConfigured) {
    return (
      <FullScreenMessage
        emoji="🔧"
        title="Almost there!"
        text="Firebase isn't configured yet. Copy .env.example to .env, fill in your Firebase keys, then restart the app. See README.md for step-by-step help."
      />
    );
  }

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Landing />} />

        <Route path="/order/:cafeId/table/:tableNumber" element={<CustomerLayout />}>
          <Route index element={<Welcome />} />
          <Route path="menu" element={<Menu />} />
          <Route path="cart" element={<Cart />} />
          <Route path="placed/:orderId" element={<OrderSuccess />} />
          <Route path="orders" element={<MyOrders />} />
        </Route>

        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<TablesView />} />
          <Route path="table/:tableId" element={<TableDetail />} />
          <Route path="menu" element={<MenuManager />} />
          <Route path="orders" element={<OrdersReports />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
