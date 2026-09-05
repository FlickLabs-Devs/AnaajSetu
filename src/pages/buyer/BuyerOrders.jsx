import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import BuyerBottomNav from '../../components/buyer/BuyerBottomNav';
import BuyerHeaderTop from '../../components/buyer/BuyerHeaderTop';

export default function BuyerOrders() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [activeOrder, setActiveOrder] = useState(null);
  const [error, setError] = useState(null);
  const [otp, setOtp] = useState('');
  
  const [expandedGroups, setExpandedGroups] = useState({});

  const toggleGroup = (groupId, e) => {
    e.stopPropagation();
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: rawOrders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('buyer_id', user.uid)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      let processedItems = [];
      if (rawOrders && rawOrders.length > 0) {
        const farmerIds = [...new Set(rawOrders.map(o => o.farmer_id).filter(Boolean))];
        const listingIds = [...new Set(rawOrders.map(o => o.listing_id).filter(Boolean))];

        const [farmersRes, listingsRes] = await Promise.all([
          farmerIds.length ? supabase.from('profiles').select('id, full_name, locality, district, state, phone_number').in('id', farmerIds) : { data: [] },
          listingIds.length ? supabase.from('listings').select('id, city, locality, district, state').in('id', listingIds) : { data: [] }
        ]);

        const farmersMap = Object.fromEntries((farmersRes.data || []).map(f => [f.id, f]));
        const listingsMap = Object.fromEntries((listingsRes.data || []).map(l => [l.id, l]));

        let imagesMap = {};
        if (listingIds.length > 0) {
            const { data: imgData } = await supabase.from('listing_images').select('listing_id, image_url, sort_order').in('listing_id', listingIds);
            (imgData || []).forEach(img => {
                if (!imagesMap[img.listing_id]) imagesMap[img.listing_id] = [];
                imagesMap[img.listing_id].push(img);
            });
        }

        const mappedOrders = rawOrders.map(o => {
            const ls = listingsMap[o.listing_id] || null;
            if (ls) ls.listing_images = imagesMap[o.listing_id] || [];
            return {
                ...o,
                farmer_profiles: farmersMap[o.farmer_id] || null,
                listings: ls
            };
        });

        const groups = {};
        const standalone = [];

        mappedOrders.forEach(o => {
          if (o.order_group_id) {
            if (!groups[o.order_group_id]) {
              groups[o.order_group_id] = {
                id: o.order_group_id,
                is_group: true,
                status: o.status,
                created_at: o.created_at,
                total_amount: 0,
                orders: []
              };
            }
            groups[o.order_group_id].orders.push(o);
            groups[o.order_group_id].total_amount += Number(o.total_amount);
            
            if (o.status === 'accepted') {
                groups[o.order_group_id].status = 'accepted';
            }
          } else {
            standalone.push({ ...o, is_group: false });
          }
        });

        processedItems = [...Object.values(groups), ...standalone].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }

      setItems(processedItems);
    } catch (err) {
      console.error(err);
      setError("Unable to load orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadOrders();
      const channel = supabase.channel('buyer_orders_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `buyer_id=eq.${user.uid}` }, loadOrders)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setActiveOrder(null);
    };
    if (activeOrder) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
    };
  }, [activeOrder]);

  const handleOpenDetail = async (order) => {
    setActiveOrder(order);
    setOtp('');
    if (order.status === 'accepted') {
        setOtp('Loading...');
        try {
            const { data, error } = await supabase.rpc('get_buyer_otp', { p_order_id: order.id, p_buyer_id: user.uid });
            if (error) throw error;
            setOtp(data || 'Unavailable');
        } catch (err) {
            console.error('OTP Fetch Error:', err);
            setOtp('Error');
        }
    }
  };

  const filtered = filter === 'all' ? items : items.filter(item => item.status === filter);

  const renderOrderCard = (order, isNested = false) => {
      const date = new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      let statusClass = 'status-pending';
      if (order.status === 'accepted') statusClass = 'status-accepted';
      else if (order.status === 'completed') statusClass = 'status-success';
      else if (order.status === 'cancelled') statusClass = 'status-rejected';

      return (
          <div 
              key={order.id} 
              className={`buyer-order-card ${isNested ? 'nested-order-card' : ''}`}
              style={isNested ? { marginBottom: 0, boxShadow: 'none', border: '1px solid var(--border)', background: 'var(--bg-main)' } : {}}
              onClick={() => handleOpenDetail(order)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpenDetail(order);
                  }
              }}
          >
              <div className="boc-header">
                  <div className="boc-header-left">
                      <h3 className="boc-title">{order.produce_name}</h3>
                      <div className="boc-seller">{order.farmer_profiles?.full_name || 'Unknown Seller'}</div>
                  </div>
                  <div className="boc-header-right">
                      <span className={`brc-status-badge ${statusClass}`}>{order.status === 'accepted' ? 'Active' : order.status}</span>
                  </div>
              </div>
              <div className="boc-body">
                  <div className="boc-detail-item">
                      <span className="boc-detail-label">Quantity</span>
                      <span className="boc-detail-value">{order.quantity} {order.unit}</span>
                  </div>
                  <div className="boc-detail-item">
                      <span className="boc-detail-label">Total</span>
                      <span className="boc-detail-value boc-price">₹{order.total_amount}</span>
                  </div>
              </div>
              {!isNested && (
                <div className="boc-footer">
                    <span className="boc-date">{date}</span>
                    <span className="boc-id">Order #{order.id.split('-')[0].toUpperCase()}</span>
                </div>
              )}
          </div>
      );
  };

  const renderGroupCard = (group) => {
      const isExpanded = expandedGroups[group.id];
      const date = new Date(group.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      
      let statusClass = 'status-pending';
      if (group.status === 'accepted') statusClass = 'status-accepted';
      else if (group.status === 'completed') statusClass = 'status-success';
      else if (group.status === 'cancelled') statusClass = 'status-rejected';

      return (
          <div key={group.id} className="buyer-order-group-card" style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1rem', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', cursor: 'pointer' }} onClick={(e) => toggleGroup(group.id, e)}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                      <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.25rem' }}>Cart Order</h3>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{group.orders.length} items • ₹{group.total_amount.toFixed(2)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: '0.5rem' }}>{date}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                      <span className={`brc-status-badge ${statusClass}`}>
                          {group.status === 'accepted' ? 'Active' : group.status}
                      </span>
                      <button style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: '0.25rem' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                              <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                      </button>
                  </div>
               </div>
               {isExpanded && (
                   <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }} onClick={e => e.stopPropagation()}>
                       <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Individual Orders</div>
                       {group.orders.map(order => renderOrderCard(order, true))}
                   </div>
               )}
          </div>
      );
  };

  return (
    <div className="buyer-app buyer-orders-page" id="buyer-app" style={{ paddingBottom: '100px' }}>
        {/* HEADER */}
        <header className="dash-header" style={{ background: 'var(--buyer-header-gradient)', paddingBottom: '1.5rem' }}>
            <BuyerHeaderTop />
            <div className="dash-header-greeting">
                <h1 style={{fontSize:'1.5rem'}}>My Orders</h1>
                <p>Track your purchases</p>
            </div>
        </header>

        {/* STATUS FILTERS */}
        <div className="buyer-filter-container">
            {['all', 'accepted', 'completed', 'cancelled'].map(f => (
                <button 
                    key={f}
                    className={`buyer-filter-pill ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                >
                    {f === 'accepted' ? 'Active' : f}
                </button>
            ))}
        </div>

        {/* Orders Grid */}
        <div className="buyer-req-list">
            {loading ? (
                <div className="buyer-page-loader">
                    <div className="bpl-logo-wrap">
                        <img src="/assets/images/logo.png" alt="AnaajSetu" className="bpl-logo" />
                        <div className="bpl-ring"></div>
                    </div>
                    <div className="bpl-text">Loading orders...</div>
                </div>
            ) : error ? (
                <div className="buyer-empty-state">
                    <div className="empty-icon" style={{color:'var(--error)'}}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </div>
                    <h3>Unable to load orders</h3>
                    <p>{error}</p>
                    <button className="btn btn-secondary mt-4" onClick={loadOrders}>Retry</button>
                </div>
            ) : filtered.length === 0 ? (
                <div className="buyer-empty-state">
                    <div className="empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                    </div>
                    <h3>No orders yet</h3>
                    <p>{filter === 'all' ? "Your order history will appear here once you complete an order." : `You have no ${filter === 'accepted' ? 'active' : filter} orders.`}</p>
                    {filter === 'all' ? (
                        <Link to="/buyer" className="btn btn-buyer-primary mt-4" style={{textDecoration:'none', display:'inline-block'}}>Browse Marketplace</Link>
                    ) : (
                        <button className="btn btn-secondary mt-4" onClick={() => setFilter('all')}>Clear Filters</button>
                    )}
                </div>
            ) : (
                filtered.map(item => item.is_group ? renderGroupCard(item) : renderOrderCard(item))
            )}
        </div>

        {/* ORDER DETAIL MODAL */}
        {activeOrder && (
            <div className="modal-overlay" onClick={() => setActiveOrder(null)}>
                <div className="buyer-bottom-sheet" onClick={(e) => e.stopPropagation()}>
                    <button className="btn-close sheet-close" onClick={() => setActiveOrder(null)} aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>

                    <div className="sheet-scroll-area">
                        {activeOrder.listings?.listing_images?.length > 0 && (
                            <div className="sheet-hero-image">
                                <img src={activeOrder.listings.listing_images.sort((a,b)=>a.sort_order-b.sort_order)[0].image_url} alt="Produce" />
                            </div>
                        )}

                        <div className="sheet-body">
                            <div className="sheet-header">
                                <h2>{activeOrder.produce_name}</h2>
                                <span className={`brc-status-badge ${activeOrder.status === 'accepted' ? 'status-accepted' : activeOrder.status === 'completed' ? 'status-success' : 'status-rejected'}`}>
                                    {activeOrder.status === 'accepted' ? 'Active' : activeOrder.status}
                                </span>
                            </div>

                            <div className="sheet-meta-id">
                                Order #{activeOrder.id.split('-')[0].toUpperCase()}
                            </div>

                            <div className="sheet-price-large">₹{activeOrder.total_amount}</div>

                            <div className="sheet-grid">
                                <div className="sheet-grid-item">
                                    <span className="sheet-label">Quantity</span>
                                    <span className="sheet-value">{activeOrder.quantity} {activeOrder.unit}</span>
                                </div>
                                <div className="sheet-grid-item">
                                    <span className="sheet-label">Agreed Price</span>
                                    <span className="sheet-value">₹{activeOrder.price_per_unit} / {activeOrder.unit}</span>
                                </div>
                            </div>

                            <div className="sheet-section">
                                <span className="sheet-label" style={{marginBottom: '0.75rem', display: 'block'}}>Order Lifecycle</span>
                                <div className="buyer-order-lifecycle">
                                    <div className="lifecycle-step">
                                        <div className="lifecycle-dot lifecycle-dot--done"></div>
                                        <div className="lifecycle-label" style={{color: 'var(--text)'}}>Placed</div>
                                    </div>
                                    <div className={`lifecycle-connector ${activeOrder.status === 'accepted' || activeOrder.status === 'completed' ? 'lifecycle-connector--done' : ''}`}></div>
                                    <div className="lifecycle-step">
                                        <div className={`lifecycle-dot ${activeOrder.status === 'accepted' ? 'lifecycle-dot--active' : activeOrder.status === 'completed' ? 'lifecycle-dot--done' : activeOrder.status === 'cancelled' ? 'lifecycle-dot--rejected' : ''}`}></div>
                                        <div className="lifecycle-label" style={{color: activeOrder.status === 'accepted' || activeOrder.status === 'completed' || activeOrder.status === 'cancelled' ? 'var(--text)' : 'var(--text-faint)'}}>{activeOrder.status === 'cancelled' ? 'Cancelled' : 'Accepted'}</div>
                                    </div>
                                    {activeOrder.status !== 'cancelled' && (
                                        <>
                                            <div className={`lifecycle-connector ${activeOrder.status === 'completed' ? 'lifecycle-connector--done' : ''}`}></div>
                                            <div className="lifecycle-step">
                                                <div className={`lifecycle-dot ${activeOrder.status === 'completed' ? 'lifecycle-dot--done' : ''}`}></div>
                                                <div className="lifecycle-label" style={{color: activeOrder.status === 'completed' ? 'var(--text)' : 'var(--text-faint)'}}>Completed</div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="sheet-section">
                                <span className="sheet-label">Seller Details</span>
                                <div className="sheet-farmer-card">
                                    <div className="sfc-info">
                                        <div className="sfc-name">{activeOrder.farmer_profiles?.full_name || 'Farmer'}</div>
                                        <div className="sfc-location">
                                            {[activeOrder.listings?.locality || activeOrder.farmer_profiles?.locality, activeOrder.listings?.district || activeOrder.farmer_profiles?.district].filter(Boolean).join(', ')}
                                        </div>
                                    </div>
                                </div>
                                {activeOrder.status === 'accepted' && activeOrder.farmer_profiles?.phone_number && (
                                    <a href={`tel:${activeOrder.farmer_profiles.phone_number}`} className="order-contact-action btn btn-buyer-primary btn-block mt-3" style={{display:'flex', alignItems:'center', gap:'0.5rem', justifyContent:'center'}}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                        </svg>
                                        Call Seller
                                    </a>
                                )}
                            </div>
                            
                            {activeOrder.status === 'accepted' && (
                                <div className="sheet-section">
                                    <div className="order-otp-box">
                                        <div className="otp-box-header">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18">
                                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                            </svg>
                                            Pickup Verification
                                        </div>
                                        <div className="otp-box-body">
                                            <div className="otp-value">{otp}</div>
                                            <p className="otp-help">Give this code to the seller when the order is being completed.</p>
                                            <button className="btn btn-outline btn-sm otp-copy-btn" onClick={() => navigator.clipboard.writeText(otp)}>
                                                Copy Code
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="sheet-section">
                                <span className="sheet-label">Transaction Date</span>
                                <div className="sheet-text">{new Date(activeOrder.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year:'numeric', hour:'numeric', minute:'2-digit' })}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
        <BuyerBottomNav />
    </div>
  );
}
