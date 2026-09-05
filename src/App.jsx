import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Onboarding from './pages/auth/Onboarding';

import SellerDashboard from './pages/seller/SellerDashboard';
import ListingForm from './pages/seller/ListingForm';
import SellerRequests from './pages/seller/SellerRequests';
import SellerNegotiations from './pages/seller/SellerNegotiations';
import SellerOrders from './pages/seller/SellerOrders';
import SellerProfile from './pages/seller/SellerProfile';
import SellerBottomNav from './components/seller/SellerBottomNav';

import BuyerDashboard from './pages/buyer/BuyerDashboard';
import BuyerRequests from './pages/buyer/BuyerRequests';
import BuyerNegotiations from './pages/buyer/BuyerNegotiations';
import BuyerOrders from './pages/buyer/BuyerOrders';
import BuyerProfile from './pages/buyer/BuyerProfile';
import BuyerBottomNav from './components/buyer/BuyerBottomNav';

// Simple placeholders to prevent routing errors during transition
const Placeholder = ({ title }) => (
  <div className="farmer-page">
    <header className="form-page-header">
      <h1 style={{margin: '1rem'}}>{title}</h1>
    </header>
    <div style={{padding: '2rem', textAlign: 'center'}} className="text-muted">
      This page is currently being migrated to React.
    </div>
    <SellerBottomNav />
  </div>
);

// Basic protected route wrapper
const ProtectedRoute = ({ children, roleRequired }) => {
  const { user, profile, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner spinner-green"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roleRequired && profile?.role !== roleRequired) return <Navigate to="/onboarding" replace />;
  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
          
          {/* Seller Routes */}
          <Route path="/seller" element={<ProtectedRoute roleRequired="farmer"><SellerDashboard /></ProtectedRoute>} />
          <Route path="/seller/listings/new" element={<ProtectedRoute roleRequired="farmer"><ListingForm /></ProtectedRoute>} />
          <Route path="/seller/listings/edit/:id" element={<ProtectedRoute roleRequired="farmer"><ListingForm /></ProtectedRoute>} />
          
          <Route path="/seller/negotiations" element={<ProtectedRoute roleRequired="farmer"><SellerNegotiations /></ProtectedRoute>} />
          <Route path="/seller/requests" element={<ProtectedRoute roleRequired="farmer"><SellerRequests /></ProtectedRoute>} />
          <Route path="/seller/orders" element={<ProtectedRoute roleRequired="farmer"><SellerOrders /></ProtectedRoute>} />
          <Route path="/seller/profile" element={<ProtectedRoute roleRequired="farmer"><SellerProfile /></ProtectedRoute>} />

          {/* Buyer Routes */}
          <Route path="/buyer" element={<ProtectedRoute roleRequired="buyer"><BuyerDashboard /></ProtectedRoute>} />
          <Route path="/buyer/requests" element={<ProtectedRoute roleRequired="buyer"><BuyerRequests /></ProtectedRoute>} />
          <Route path="/buyer/negotiations" element={<ProtectedRoute roleRequired="buyer"><BuyerNegotiations /></ProtectedRoute>} />
          <Route path="/buyer/orders" element={<ProtectedRoute roleRequired="buyer"><BuyerOrders /></ProtectedRoute>} />
          <Route path="/buyer/profile" element={<ProtectedRoute roleRequired="buyer"><BuyerProfile /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
