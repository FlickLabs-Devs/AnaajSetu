import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabase';

export default function SellerOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, accepted, completed, cancelled
  const [activeOrder, setActiveOrder] = useState(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpProcessing, setOtpProcessing] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [error, setError] = useState(null);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: rawOrders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('farmer_id', user.uid)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      if (!rawOrders || rawOrders.length === 0) {
        setOrders([]);
        return;
      }

      const buyerIds = [...new Set(rawOrders.map(o => o.buyer_id).filter(Boolean))];
      const listingIds = [...new Set(rawOrders.map(o => o.listing_id).filter(Boolean))];

      const [buyersRes, listingsRes] = await Promise.all([
        buyerIds.length > 0 ? supabase.from('profiles').select('id, full_name, locality, district, state, phone_number').in('id', buyerIds) : { data: [] },
        listingIds.length > 0 ? supabase.from('listings').select('id, city, locality, district, state').in('id', listingIds) : { data: [] }
      ]);

      const buyersMap = Object.fromEntries((buyersRes.data || []).map(b => [b.id, b]));
      const listingsMap = Object.fromEntries((listingsRes.data || []).map(l => [l.id, l]));

      let imagesMap = {};
      if (listingIds.length > 0) {
        const { data: imgData } = await supabase.from('listing_images').select('listing_id, image_url, sort_order').in('listing_id', listingIds);
        (imgData || []).forEach(img => {
          if (!imagesMap[img.listing_id]) imagesMap[img.listing_id] = [];
          imagesMap[img.listing_id].push(img);
        });
      }

      const fullOrders = rawOrders.map(o => {
        const ls = listingsMap[o.listing_id] || null;
        if (ls) {
            ls.listing_images = imagesMap[o.listing_id] || [];
        }
        return {
          ...o,
          buyer_profiles: buyersMap[o.buyer_id] || null,
          listings: ls
        };
      });

      setOrders(fullOrders);

      if (activeOrder) {
        const updated = fullOrders.find(o => o.id === activeOrder.id);
        if (updated) {
            setActiveOrder(updated);
            if (updated.status === 'completed') fetchReview(updated.id);
        }
      }
    } catch (err) {
      console.error(err);
      setError("Couldn't load orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadOrders();
  }, [user]);

  const fetchReview = async (orderId) => {
    try {
        const { data, error } = await supabase.from('farmer_reviews').select('rating, review_text').eq('order_id', orderId).maybeSingle();
        if (!error && data) {
            setActiveOrder(prev => {
                if (prev && prev.id === orderId) {
                    return { ...prev, reviewData: data };
                }
                return prev;
            });
        }
    } catch (e) {
        console.error("Review fetch error", e);
    }
  };

  const handleOpenDetail = (order) => {
    setActiveOrder(order);
    if (order.status === 'completed' && !order.reviewData) {
        fetchReview(order.id);
    }
  };

  const handleOtpVerify = async () => {
    if (otpValue.length !== 6) {
        setOtpError("Please enter a 6-digit OTP.");
        return;
    }
    setOtpProcessing(true);
    setOtpError("");
    try {
        const { data, error } = await supabase.rpc('verify_order_otp', {
            p_order_id: activeOrder.id,
            p_farmer_id: user.uid,
            p_otp: otpValue
        });

        if (error) {
            if (error.message && error.message.includes('unavailable')) {
                setOtpError('Verification code unavailable for this order.');
            } else if (error.message && error.message.includes('Unauthorized')) {
                setOtpError('Unauthorized action.');
            } else {
                setOtpError('Incorrect OTP. Ask the buyer to confirm the code and try again.');
            }
        } else if (data === true) {
            showToast({ type: 'success', title: 'Order Completed', message: 'Order completed successfully!' });
            setShowOtpModal(false);
            setOtpValue("");
            loadOrders();
        } else {
            setOtpError('Incorrect OTP. Ask the buyer to confirm the code and try again.');
        }
    } catch (err) {
        console.error(err);
        setOtpError('Error verifying OTP.');
    } finally {
        setOtpProcessing(false);
    }
  };

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  return (
    <div className="farmer-page seller-app">
      <header className="seller-page-header">
        <button type="button" className="seller-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h1 className="seller-page-title" style={{margin:0}}>Orders</h1>
      </header>

      <div style={{paddingBottom: '1rem'}}>
        <div className="seller-filter-bar">
          {['all', 'accepted', 'completed', 'cancelled'].map(f => (
            <button 
              key={f}
              className={`seller-filter-pill ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{textAlign:'center', padding:'3rem'}}><div className="spinner spinner-green"></div></div>
        ) : error ? (
          <div className="empty-state">
            <h3 className="empty-title">{error}</h3>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3 className="empty-title">No orders yet</h3>
            <p className="empty-text text-muted">Orders from buyers will appear here after you accept a request or negotiation.</p>
          </div>
        ) : (
          <div className="seller-order-list">
            {filtered.map(order => {
              const date = new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

              return (
                <div key={order.id} className="seller-order-card" onClick={() => handleOpenDetail(order)}>
                  <div className="seller-order-header">
                      <div>
                          <h3>{order.produce_name}</h3>
                          <div className="seller-order-id">Order #{order.id.split('-')[0].toUpperCase()}</div>
                      </div>
                      <span className={`seller-badge seller-badge-${order.status}`}>{order.status}</span>
                  </div>
                  
                  <div className="seller-order-summary">
                      <div>
                          <div className="seller-order-info">{order.quantity} {order.unit}</div>
                          <div className="text-muted" style={{fontSize:'0.85rem'}}>× ₹{order.price_per_unit}/{order.unit}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                          <div className="text-muted" style={{fontSize:'0.8rem'}}>Total</div>
                          <div className="seller-order-total">₹{order.total_amount}</div>
                      </div>
                  </div>
                  <div className="seller-order-footer">
                      <span style={{fontWeight:600, color:'var(--text)'}}>Buyer: {order.buyer_profiles?.full_name || 'Buyer'}</span>
                      <span>{date}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
          {activeOrder && (
        <div className="seller-modal-overlay active" onClick={(e) => { if (e.target.className.includes('seller-modal-overlay')) setActiveOrder(null); }}>
          <div className="seller-modal-content">
            
            <header className="seller-modal-header">
                <button className="seller-back-btn" onClick={() => setActiveOrder(null)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <div>
                    <h2 className="seller-modal-title">Order Details</h2>
                    <div className="text-muted" style={{fontSize:'0.85rem', fontFamily:'monospace'}}>#{activeOrder.id.split('-')[0].toUpperCase()}</div>
                </div>
            </header>

            <div className="seller-modal-body">
                {activeOrder.listings?.listing_images?.length > 0 && (
                    <div style={{marginBottom:'1.5rem', borderRadius:'var(--radius-lg)', overflow:'hidden'}}>
                        <img src={activeOrder.listings.listing_images.sort((a,b)=>a.sort_order - b.sort_order)[0].image_url} alt="Produce" className="seller-order-detail-image" />
                    </div>
                )}

                <div className="seller-order-detail-header">
                    <div>
                        <h2 style={{margin:'0 0 0.25rem 0'}}>{activeOrder.produce_name}</h2>
                        <div className="text-muted" style={{fontSize:'0.85rem'}}>
                            {new Date(activeOrder.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                    <span className={`seller-badge seller-badge-${activeOrder.status}`}>{activeOrder.status}</span>
                </div>

                <div className="seller-order-info-card">
                    <div className="seller-order-info-row">
                        <span className="text-muted">Quantity</span>
                        <span style={{fontWeight:600}}>{activeOrder.quantity} {activeOrder.unit}</span>
                    </div>
                    <div className="seller-order-info-row">
                        <span className="text-muted">Price per unit</span>
                        <span style={{fontWeight:600}}>₹{activeOrder.price_per_unit} / {activeOrder.unit}</span>
                    </div>
                    <div className="seller-order-info-row" style={{background:'var(--surface-alt)'}}>
                        <span style={{fontWeight:600}}>Total Amount</span>
                        <span style={{fontWeight:800, color:'var(--seller-primary)', fontSize:'1.125rem'}}>₹{activeOrder.total_amount}</span>
                    </div>
                </div>

                <div className="seller-order-buyer-card" style={{padding: '1rem'}}>
                    <h3 style={{margin:'0 0 1rem 0', fontSize:'1rem'}}>Buyer Details</h3>
                    <div style={{fontWeight:600, marginBottom:'0.25rem'}}>{activeOrder.buyer_profiles?.full_name || 'Unknown Buyer'}</div>
                    <div className="text-muted" style={{fontSize:'0.85rem', marginBottom:'1rem'}}>
                        {[activeOrder.buyer_profiles?.locality, activeOrder.buyer_profiles?.district, activeOrder.buyer_profiles?.state].filter(Boolean).join(', ') || 'Location unknown'}
                    </div>
                    {(activeOrder.status === 'accepted' || activeOrder.status === 'completed') && activeOrder.buyer_profiles?.phone_number && (
                        <a href={`tel:${activeOrder.buyer_profiles.phone_number}`} className="seller-btn seller-btn-outline seller-btn-block">
                            📞 Call Buyer
                        </a>
                    )}
                </div>

                {activeOrder.status === 'completed' && activeOrder.reviewData && (
                    <div className="seller-order-review" style={{padding: '1rem'}}>
                        <h3 style={{margin:'0 0 0.5rem 0', fontSize:'1rem'}}>Buyer Review</h3>
                        <div style={{display:'flex', color:'#fbbf24', fontSize:'1.2rem', marginBottom:'0.5rem'}}>
                            {"★".repeat(activeOrder.reviewData.rating).padEnd(5, "☆")}
                        </div>
                        <div style={{fontStyle:'italic', color:'var(--text-muted)', fontSize:'0.9rem'}}>
                            {activeOrder.reviewData.review_text ? `"${activeOrder.reviewData.review_text}"` : 'No written review.'}
                        </div>
                    </div>
                )}
            </div>

            <div className="seller-modal-footer" style={{flexDirection: 'column', alignItems: 'stretch'}}>
                {activeOrder.status === 'accepted' && (
                    <button className="seller-btn seller-btn-primary seller-btn-block" onClick={() => setShowOtpModal(true)}>Enter OTP from Buyer to Complete Order</button>
                )}
                {activeOrder.status === 'completed' && (
                    <div style={{textAlign:'center', fontWeight:600, color:'var(--seller-primary)', padding: '0.75rem 0'}}>Order Completed ✓</div>
                )}
                {activeOrder.status === 'cancelled' && (
                    <div style={{textAlign:'center', fontWeight:600, color:'var(--danger)', padding: '0.75rem 0'}}>Order Cancelled ✕</div>
                )}
            </div>
          </div>
        </div>
      )}

      {showOtpModal && (
        <div className="seller-modal-overlay active">
            <div className="seller-modal-content" style={{maxWidth:'360px', margin:'auto', borderRadius:'var(--radius-xl)'}}>
                <div className="seller-modal-body" style={{textAlign:'center', padding: '2rem 1.5rem'}}>
                    <h3 style={{marginTop:0, marginBottom: '0.5rem'}}>Verify Completion</h3>
                    <p className="text-muted" style={{fontSize:'0.9375rem', marginBottom:'1.5rem', lineHeight: 1.5}}>
                        Ask the buyer for the 6-digit OTP to confirm delivery and complete this order.
                    </p>
                    {otpError && <div className="alert alert-error" style={{display:'block', marginBottom:'1rem'}}>{otpError}</div>}
                    
                    <input 
                        type="text" 
                        className="form-control" 
                        style={{textAlign:'center', fontSize:'1.75rem', letterSpacing:'0.3em', fontWeight:700, padding:'1rem', borderRadius: 'var(--radius-md)'}}
                        placeholder="------"
                        maxLength={6}
                        value={otpValue}
                        onChange={e => setOtpValue(e.target.value.replace(/[^0-9]/g, ''))}
                    />

                    <div style={{display:'flex', gap:'1rem', marginTop:'2rem'}}>
                        <button className="seller-btn seller-btn-outline" style={{flex:1}} disabled={otpProcessing} onClick={() => {setShowOtpModal(false); setOtpError('');}}>Cancel</button>
                        <button className="seller-btn seller-btn-primary" style={{flex:1}} disabled={otpProcessing || otpValue.length !== 6} onClick={handleOtpVerify}>
                            {otpProcessing ? '...' : 'Verify'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
    </div>
  );
}
