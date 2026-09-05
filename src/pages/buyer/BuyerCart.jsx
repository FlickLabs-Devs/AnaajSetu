import React, { useState } from 'react';
import { useCart } from '../../hooks/useCart';
import { Link, useNavigate } from 'react-router-dom';
import BuyerHeaderTop from '../../components/buyer/BuyerHeaderTop';
import BuyerBottomNav from '../../components/buyer/BuyerBottomNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { getFriendlyErrorMessage } from '../../utils/userMessages';

export default function BuyerCart() {
  const { user } = useAuth();
  const { cartItems, cartTotal, loadingCart, updateQuantity, removeFromCart, clearCartLocal } = useCart();
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleCheckout = async () => {
    if (!user) return;
    setCheckingOut(true);

    try {
      const { data, error } = await supabase.rpc('checkout_cart', { p_buyer_id: user.uid });
      
      if (error) {
        throw error;
      }
      
      if (data && data.success) {
        setCheckoutSuccess(true);
        clearCartLocal();
        setTimeout(() => {
          navigate('/buyer/requests');
        }, 2500);
      } else {
        throw new Error('Checkout failed unexpectedly.');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      showToast({ type: 'error', title: 'Checkout Failed', message: getFriendlyErrorMessage(err) });
    } finally {
      setCheckingOut(false);
    }
  };

  if (loadingCart) {
    return (
      <div className="buyer-page buyer-app" id="buyer-app">
        <header className="dash-header" style={{ background: 'var(--buyer-header-gradient)', paddingBottom: '1.5rem' }}>
            <BuyerHeaderTop />
            <div className="dash-header-greeting">
                <h1 style={{fontSize:'1.5rem'}}>My Cart</h1>
            </div>
        </header>
        <div className="buyer-page-loader">
            <div className="bpl-spinner"></div>
            <div className="bpl-text">Loading cart...</div>
        </div>
        <BuyerBottomNav />
      </div>
    );
  }

  if (checkoutSuccess) {
    return (
      <div className="buyer-page buyer-app" id="buyer-app">
        <div className="cart-success-state" style={{ padding: '3rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="40" height="40">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.5rem' }}>Requests Sent!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Your purchase requests are now waiting for farmer approval.</p>
            <div className="bpl-spinner" style={{width: '30px', height: '30px', borderTopColor: 'var(--buyer-primary)'}}></div>
            <p style={{ color: 'var(--text-faint)', marginTop: '1rem', fontSize: '0.875rem' }}>Redirecting to your requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="buyer-page buyer-app buyer-cart-page" id="buyer-app" style={{ paddingBottom: '120px' }}>
      <header className="dash-header" style={{ background: 'var(--buyer-header-gradient)', paddingBottom: '1.5rem' }}>
          <BuyerHeaderTop />
          <div className="dash-header-greeting">
              <h1 style={{fontSize:'1.5rem'}}>My Cart</h1>
              <p>Review and checkout</p>
          </div>
      </header>

      <div className="cart-content" style={{ padding: '1.5rem' }}>
        {cartItems.length === 0 ? (
          <div className="empty-state" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{width: '64px', height: '64px', color: 'var(--text-faint)', marginBottom: '1rem', marginInline: 'auto'}}>
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>Your cart is empty</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Looks like you haven't added anything yet.</p>
            <Link to="/buyer" className="btn btn-buyer-primary" style={{ display: 'inline-block' }}>Browse Marketplace</Link>
          </div>
        ) : (
          <div className="cart-layout">
            <div className="cart-items-list">
              {cartItems.map(item => {
                const liveListing = item.listings;
                const priceHasChanged = liveListing && Number(liveListing.price_per_unit) !== Number(item.price_per_unit);
                const currentPrice = liveListing ? liveListing.price_per_unit : item.price_per_unit;
                const isOutOfStock = liveListing && (liveListing.status !== 'active' || liveListing.quantity < item.quantity);
                const isBelowMoq = liveListing && item.quantity < liveListing.minimum_order_quantity;
                
                let warningMsg = null;
                if (isOutOfStock) warningMsg = 'Insufficient stock for this quantity.';
                else if (isBelowMoq) warningMsg = `Minimum order is ${liveListing.minimum_order_quantity} ${item.unit}.`;
                else if (priceHasChanged) warningMsg = `Price updated to ₹${currentPrice} (was ₹${item.price_per_unit}).`;

                return (
                  <div key={item.id} className="cart-item-card" style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '1rem', marginBottom: '1rem', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                      <div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)' }}>{item.produce_name}</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Sold by Farmer</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)' }}>₹{currentPrice} <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>/ {item.unit}</span></div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--buyer-primary)', marginTop: '0.25rem' }}>₹{(Number(currentPrice) * Number(item.quantity)).toFixed(2)}</div>
                      </div>
                    </div>
                    
                    {warningMsg && (
                      <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', marginBottom: '1rem', fontWeight: 600 }}>
                        {warningMsg}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="ld-qty-control" style={{ maxWidth: '140px', margin: 0, padding: '0.25rem' }}>
                        <button 
                          className="ld-qty-btn" 
                          type="button" 
                          onClick={() => updateQuantity(item.id, Math.max(liveListing ? liveListing.minimum_order_quantity : 1, Number(item.quantity) - 1))}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        </button>
                        <div className="ld-qty-input-wrap">
                          <input 
                            type="number" 
                            className="ld-qty-input" 
                            value={item.quantity} 
                            readOnly 
                          />
                        </div>
                        <button 
                          className="ld-qty-btn" 
                          type="button" 
                          onClick={() => updateQuantity(item.id, Math.min(liveListing ? liveListing.quantity : 9999, Number(item.quantity) + 1))}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </button>
                      </div>
                      
                      <button 
                        onClick={() => removeFromCart(item.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-faint)', padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Remove</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="cart-summary" style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginTop: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1.25rem' }}>Order Summary</h3>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
                <span>Subtotal ({cartItems.length} items)</span>
                <span>₹{cartTotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem', color: 'var(--text-muted)' }}>
                <span>Platform Fee</span>
                <span>Free</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginBottom: '1.5rem', fontWeight: 800, fontSize: '1.25rem', color: 'var(--text)' }}>
                <span>Total Amount</span>
                <span>₹{cartTotal.toFixed(2)}</span>
              </div>

              <button 
                className="btn btn-buyer-primary w-100" 
                style={{ padding: '1rem', fontSize: '1.125rem' }} 
                onClick={handleCheckout}
                disabled={checkingOut}
              >
                {checkingOut ? 'Processing...' : 'Proceed to Checkout'}
              </button>
              
              <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: '1rem' }}>
                By checking out, you agree to purchase the items directly from the farmers.
              </p>
            </div>
          </div>
        )}
      </div>

      <BuyerBottomNav />
    </div>
  );
}
