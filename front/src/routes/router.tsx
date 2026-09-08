import { createBrowserRouter } from 'react-router-dom';

import Login from '../pages/Login/Login';
import Register from '../pages/Register/Register';
import CompleteProfile from '../pages/CompleteProfile/CompleteProfile';
import Home from '../pages/Home/Home';
import Classes from '../pages/Classes/Classes';
import About from '../pages/About/About';
import Contact from '../pages/Contact/Contact';
import Plan from '../pages/Plan/Plan';
import Checkout from '../pages/Checkout/Checkout';
import CheckoutWallet from '../pages/Checkout/CheckoutWallet';
import CheckoutReturn from '../pages/Checkout/CheckoutReturn';
import NotFound from '../pages/NotFound/NotFound';
import Trainers from '../pages/Trainers/Trainers';
import Dashboard from '../pages/Dashboard/Dashboard';
import AdminDashboard from '../pages/Admin/AdminDashboard';
import Terms from '../pages/Legal/Terms';
import Privacy from '../pages/Legal/Privacy';
import Rules from '../pages/Legal/Rules';
import ProtectedRoute from './ProtectedRoute';
import RootLayout from './RootLayout';

// Every route hangs off RootLayout, so the shared chrome renders once.
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/',
        element: <Home />,
      },
      {
        path: '/login',
        element: <Login />,
      },
      {
        path: '/register',
        element: <Register />,
      },
      {
        path: '/complete-profile',
        element: <CompleteProfile />,
      },
      {
        path: '/class',
        element: <Classes />,
      },
      {
        path: '/about',
        element: <About />,
      },
      {
        path: '/contact',
        element: <Contact />,
      },
      {
        path: '/contacto',
        element: <Contact />,
      },
      {
        path: '/membership',
        element: <Plan />,
      },
      {
        path: '/checkout',
        element: <Checkout />,
      },
      {
        path: '/checkout/wallet',
        element: (
          <ProtectedRoute>
            <CheckoutWallet />
          </ProtectedRoute>
        ),
      },
      {
        path: '/checkout/return',
        element: (
          <ProtectedRoute>
            <CheckoutReturn />
          </ProtectedRoute>
        ),
      },
      {
        path: '/trainers',
        element: <Trainers />,
      },
      {
        path: '/dashboard',
        element: (
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: '/admin',
        element: (
          <ProtectedRoute requiredRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: '/terms',
        element: <Terms />,
      },
      {
        path: '/privacy',
        element: <Privacy />,
      },
      {
        path: '/rules',
        element: <Rules />,
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
]);
