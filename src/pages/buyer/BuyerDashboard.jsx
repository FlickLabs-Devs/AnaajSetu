import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useCart } from '../../hooks/useCart';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import { buyerService } from '../../services/buyerService';
import BuyerHeaderTop from '../../components/buyer/BuyerHeaderTop';
import BuyerBottomNav from '../../components/buyer/BuyerBottomNav';

export default function BuyerDashboard() {
  const { user, profile } = useAuth();
  const { addToCart } = useCart();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [showAllInsights, setShowAllInsights] = useState(false);
  
  const [activeListing, setActiveListing] = useState(null);
  
  // Request State
  const [reqQty, setReqQty] = useState('');
  const [reqProcessing, setReqProcessing] = useState(false);
  const [reqError, setReqError] = useState('');
  const [reqSuccess, setReqSuccess] = useState(false);
  
  // Negotiation State
  const [showNegModal, setShowNegModal] = useState(false);
  const [negPrice, setNegPrice] = useState('');
  const [negMsg, setNegMsg] = useState('');
  const [negProcessing, setNegProcessing] = useState(false);
  const [negError, setNegError] = useState('');

  // Cart state
  const [cartAdding, setCartAdding] = useState(false);
  const [cartAdded, setCartAdded] = useState(false);

  const loadListings = async () => {
    try {
      const { data, error } = await supabase
        .from('listings')
        .select(`
            *,
            listing_images ( id, image_url, sort_order ),
            profiles!fk_farmer ( full_name, phone_number )
        `)
        .eq('status', 'active')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      let items = data || [];
      if (items.length > 0) {
        const farmerIds = [...new Set(items.map(l => l.farmer_id))];
        const { data: repData } = await supabase.from('farmer_reputation_view').select('*').in('farmer_id', farmerIds);
        if (repData) {
            const repMap = Object.fromEntries(repData.map(r => [r.farmer_id, r]));
            items = items.map(l => ({ ...l, reputation: repMap[l.farmer_id] }));
        }
      }
      setListings(items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadListings();
      buyerService.getDashboardAnalytics(user.uid).then(setAnalytics).catch(console.error);
      const channel = supabase.channel('buyer_dash_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, loadListings)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  // Reset added state when active listing changes
  useEffect(() => {
    if (activeListing) {
      setCartAdded(false);
    }
  }, [activeListing]);

  const calculateScore = (listing) => {
    if (!profile) return 0;
    const l1 = (listing.locality || '').toLowerCase();
    const c1 = (listing.city || '').toLowerCase();
    const d1 = (listing.district || '').toLowerCase();
    const s1 = (listing.state || '').toLowerCase();

    const l2 = (profile.locality || '').toLowerCase();
    const c2 = (profile.city || '').toLowerCase();
    const d2 = (profile.district || '').toLowerCase();
    const s2 = (profile.state || '').toLowerCase();

    if (l1 && l1 === l2) return 4;
    if (c1 && c1 === c2) return 3;
    if (d1 && d1 === d2) return 2;
    if (s1 && s1 === s2) return 1;
    return 0;
  };

  const getFilteredListings = () => {
    let filtered = listings;
    if (category !== 'All') {
        filtered = filtered.filter(l => l.category === category);
    }
    if (search) {
        const lowerSearch = search.toLowerCase();
        filtered = filtered.filter(l => 
            l.produce_name.toLowerCase().includes(lowerSearch) ||
            l.category.toLowerCase().includes(lowerSearch) ||
            (l.locality && l.locality.toLowerCase().includes(lowerSearch)) ||
            (l.city && l.city.toLowerCase().includes(lowerSearch))
        );
    }
    const scored = filtered.map(l => ({ ...l, matchScore: calculateScore(l) }));
    scored.sort((a, b) => b.matchScore - a.matchScore);
    
    return {
        nearby: scored.filter(l => l.matchScore >= 2),
        other: scored.filter(l => l.matchScore < 2)
    };
  };

  const { nearby, other } = getFilteredListings();

  const handleOpenDetail = (listing) => {
    setActiveListing(listing);
    setReqQty(listing.minimum_order_quantity || 1);
    setReqError('');
    setReqSuccess(false);
  };

  const handleOpenNeg = (listing, e) => {
    if (e) e.stopPropagation();
    setActiveListing(listing);
    setReqQty(listing.minimum_order_quantity || 1);
    setNegPrice(listing.price_per_unit);
    setNegMsg('');
    setNegError('');
    setShowNegModal(true);
  };

  const validateReqQty = (qty) => {
    const min = parseFloat(activeListing?.minimum_order_quantity || 1);
    const max = parseFloat(activeListing?.quantity || 0);
    if (isNaN(qty) || qty < min) return `Minimum order is ${min} ${activeListing?.unit}.`;
    if (qty > max) return `Only ${max} ${activeListing?.unit} available.`;
    return null;
  };

  const submitRequest = async () => {
    const qty = parseFloat(reqQty);
    const err = validateReqQty(qty);
    if (err) { setReqError(err); return; }
    
    setReqProcessing(true);
    setReqError('');

    try {
        const { data: existing } = await supabase.from('requests')
            .select('id').eq('listing_id', activeListing.id).eq('buyer_id', user.uid).eq('status', 'pending');
        
        if (existing && existing.length > 0) {
            setReqError("You already have a pending request for this listing.");
            setReqProcessing(false);
            return;
        }

        const { error: insertErr } = await supabase.from('requests').insert({
            listing_id: activeListing.id,
            buyer_id: user.uid,
            farmer_id: activeListing.farmer_id,
            requested_quantity: qty,
            unit: activeListing.unit,
            offered_price_per_unit: activeListing.price_per_unit,
            status: 'pending'
        });

        if (insertErr) throw insertErr;
        setReqSuccess(true);
    } catch (e) {
        console.error(e);
        setReqError("Could not send request. Please try again.");
    } finally {
        setReqProcessing(false);
    }
  };

  const submitNegotiation = async () => {
    const qty = parseFloat(reqQty);
    const price = parseFloat(negPrice);
    
    const qtyErr = validateReqQty(qty);
    if (qtyErr) { setNegError(qtyErr); return; }
    
    if (isNaN(price) || price <= 0) {
        setNegError("Please enter a valid offer price.");
        return;
    }

    setNegProcessing(true);
    setNegError('');

    try {
        const { data: existing } = await supabase.from('negotiations')
            .select('id').eq('listing_id', activeListing.id).eq('buyer_id', user.uid).in('status', ['active', 'accepted']);
        
        if (existing && existing.length > 0) {
            setNegError("You already have an active offer for this listing.");
            setNegProcessing(false);
            return;
        }

        const { data: negData, error: negErr } = await supabase.from('negotiations').insert({
            listing_id: activeListing.id,
            buyer_id: user.uid,
            farmer_id: activeListing.farmer_id,
            status: 'active'
        }).select().single();

        if (negErr) throw negErr;

        const { data: offerData, error: offerErr } = await supabase.from('negotiation_offers').insert({
            negotiation_id: negData.id,
            offered_by: user.uid,
            price_per_unit: price,
            quantity: qty,
            message: negMsg.trim(),
            offer_number: 1,
            offer_type: 'initial',
            status: 'pending'
        }).select().single();

        if (offerErr) throw offerErr;

        await supabase.from('negotiations').update({ current_offer_id: offerData.id }).eq('id', negData.id);
        
        setShowNegModal(false);
        setReqSuccess(true); // Reuse success state in detail modal
    } catch (e) {
        console.error(e);
        setNegError("Failed to send offer. Please try again.");
    } finally {
        setNegProcessing(false);
    }
  };

  const handleAddToCart = async () => {
    if (!activeListing || !reqQty) return;
    setReqError('');
    setCartAdding(true);
    
    try {
      const { success, error } = await addToCart(activeListing, reqQty);
      if (!success) throw new Error(error);
      
      setCartAdded(true);
      setTimeout(() => setCartAdded(false), 3000);
    } catch (err) {
      setReqError(err.message || 'Failed to add to cart.');
    } finally {
      setCartAdding(false);
    }
  };

  const renderCard = (listing) => {
    const sortedImages = (listing.listing_images || []).sort((a, b) => a.sort_order - b.sort_order);
    const imgSrc = sortedImages[0]?.image_url;
    
    return (
        <div key={listing.id} className="buyer-card" onClick={() => handleOpenDetail(listing)}>
            <div className="bc-image">
                {imgSrc ? (
                    <img src={imgSrc} alt={listing.produce_name} />
                ) : (
                    <div className="bc-image-placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                    </div>
                )}
                <div className="bc-badge">{listing.category}</div>
            </div>
            <div className="bc-body">
                <h3 className="bc-title">{listing.produce_name}</h3>
                <div className="bc-farm">{listing.profiles?.full_name || 'Farmer'}</div>
                
                <div className="bc-price-row">
                    <span className="bc-price">₹{listing.price_per_unit}</span>
                    <span className="bc-price-unit">/ {listing.unit}</span>
                </div>
                
                <div className="bc-avail">Available: {listing.quantity} {listing.unit}</div>
                
                <div className="bc-loc">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>{[listing.locality, listing.city].filter(Boolean).join(', ')}</span>
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="buyer-page buyer-app" id="buyer-app">
        {/* HEADER */}
        <header className="dash-header" style={{ background: 'var(--buyer-header-gradient)' }}>
            <BuyerHeaderTop />
            {profile ? (
                <div className="dash-header-greeting">
                    <h1>Good morning, {profile.full_name?.split(' ')[0] || 'there'}</h1>
                    <p>Find fresh local produce today</p>
                    <p>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{opacity:0.8, flexShrink:0}}>
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span>{[profile.locality, profile.city].filter(Boolean).join(', ') || 'Your location'}</span>
                    </p>
                </div>
            ) : (
                <div className="dash-header-greeting">
                    <div className="skeleton skeleton-title w-50" style={{background:'rgba(255,255,255,0.15)', height:'1.4rem', marginBottom:'0.4rem', borderRadius:'6px'}}></div>
                    <div className="skeleton skeleton-text w-75" style={{background:'rgba(255,255,255,0.1)', height:'0.9rem', borderRadius:'6px'}}></div>
                </div>
            )}
        </header>

        {/* SEARCH BAR (sticky) */}
        <div className="search-container">
            <div className="search-bar">
                <div className="search-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                </div>
                <input type="text" className="search-input"
                    placeholder="Search produce, category..." aria-label="Search produce"
                    value={search} onChange={e => setSearch(e.target.value)}
                />
            </div>
        </div>

        {/* CATEGORY FILTERS */}
        <div className="filter-container" role="group" aria-label="Filter by category">
            {['All', 'Vegetables', 'Fruits', 'Grains', 'Pulses', 'Spices', 'Dairy', 'Other'].map(cat => (
                <button 
                    key={cat} 
                    className={`filter-pill ${category === cat ? 'active' : ''}`}
                    onClick={() => setCategory(cat)}
                >
                    {cat}
                </button>
            ))}
        </div>

        {/* BUYING INSIGHTS SECTION */}
        <section className={`buying-insights ${showAllInsights ? 'expanded' : ''}`}>
            <div className="buying-insights-header">
                <h2>Buying Insights</h2>
                <button 
                    type="button" 
                    className="buying-insights-toggle"
                    onClick={() => setShowAllInsights(prev => !prev)}
                    aria-expanded={showAllInsights}
                >
                    {showAllInsights ? 'Show less' : 'View all'}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                        {showAllInsights ? (
                            <polyline points="18 15 12 9 6 15" />
                        ) : (
                            <polyline points="6 9 12 15 18 9" />
                        )}
                    </svg>
                </button>
            </div>
            <div className="buying-insights-grid">
                <div className="buying-insight-card" style={{cursor: 'default'}}>
                    <div className="buying-insight-label">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="9" cy="21" r="1"></circle>
                            <circle cx="20" cy="21" r="1"></circle>
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                        </svg>
                        Orders
                    </div>
                    <div className="buying-insight-value">{analytics ? analytics.spending.count : '-'}</div>
                    <div className="buying-insight-detail">{analytics ? `₹${analytics.spending.total.toLocaleString('en-IN')} total` : 'Loading...'}</div>
                </div>
                <div className="buying-insight-card" style={{cursor: 'default'}}>
                    <div className="buying-insight-label">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        Req. Success
                    </div>
                    <div className="buying-insight-value">{analytics ? `${analytics.requests.accepted}/${analytics.requests.total}` : '-'}</div>
                    <div className="buying-insight-detail">All time</div>
                </div>
                <div className="buying-insight-card insight-extra" style={{cursor: 'default'}}>
                    <div className="buying-insight-label">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 22l5-5" />
                            <path d="M7 17l10-10" />
                            <path d="M17 7l5-5" />
                        </svg>
                        Top Purchase
                    </div>
                    <div className="buying-insight-value">{analytics ? (analytics.topPurchase.name || 'None') : '-'}</div>
                    <div className="buying-insight-detail">{analytics?.topPurchase.qty > 0 ? `${analytics.topPurchase.qty} ${analytics.topPurchase.unit}` : 'No purchases'}</div>
                </div>
                <div className="buying-insight-card insight-extra" style={{cursor: 'default'}}>
                    <div className="buying-insight-label">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        Negotiations
                    </div>
                    <div className="buying-insight-value">{analytics ? analytics.negotiations.active : '-'}</div>
                    <div className="buying-insight-detail">Active deals</div>
                </div>
            </div>
        </section>

        {loading ? (
            <div className="listings-grid" style={{marginTop:'0.75rem', marginBottom:'0.5rem'}}>
                {[1,2,3,4].map(i => (
                    <div key={i} className="skeleton-card">
                        <div className="skeleton" style={{aspectRatio:'4/3', width:'100%'}}></div>
                        <div style={{padding:'0.625rem'}}>
                            <div className="skeleton w-75" style={{height:'1rem', marginBottom:'0.5rem'}}></div>
                            <div className="skeleton w-50" style={{height:'0.75rem'}}></div>
                        </div>
                    </div>
                ))}
            </div>
        ) : (nearby.length === 0 && other.length === 0) ? (
            <div className="empty-state">
                <div className="empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                </div>
                <h3>No produce found</h3>
                <p>Try a different search or clear your filters to see all available produce.</p>
                <button className="btn btn-secondary mt-4" onClick={() => {setSearch(''); setCategory('All');}}>Clear filters</button>
            </div>
        ) : (
            <div>
                {nearby.length > 0 && (
                    <div id="nearby-section">
                        <h2 className="section-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                <circle cx="12" cy="10" r="3" />
                            </svg>
                            Near you
                        </h2>
                        <div className="listings-grid">
                            {nearby.map(renderCard)}
                        </div>
                    </div>
                )}

                {other.length > 0 && (
                    <div id="other-section">
                        <h2 className="section-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            </svg>
                            More produce
                        </h2>
                        <div className="listings-grid">
                            {other.map(renderCard)}
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* LISTING DETAIL MODAL */}
        {activeListing && !showNegModal && (
            <div className="modal-overlay listing-detail-overlay active">
                <div className="listing-detail-content buyer-bottom-sheet">
                    <button className="ld-close-btn" onClick={() => setActiveListing(null)} aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>

                    <div className="ld-scroll-area">
                        {activeListing.listing_images?.length > 0 ? (
                            <div className="ld-hero-image">
                                <img src={activeListing.listing_images.sort((a,b)=>a.sort_order-b.sort_order)[0].image_url} alt="Produce" />
                            </div>
                        ) : (
                            <div className="ld-hero-placeholder">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                        )}

                        <div className="ld-body">
                            <div className="ld-header">
                                <h2>{activeListing.produce_name}</h2>
                                <div className="ld-subtitle">{activeListing.category} · {activeListing.quality}</div>
                            </div>
                            
                            <div className="ld-price-large">₹{activeListing.price_per_unit} <span>/ {activeListing.unit}</span></div>

                            <div className="ld-stats-grid">
                                <div className="ld-stat-card">
                                    <div className="ld-stat-label">AVAILABLE</div>
                                    <div className="ld-stat-value">{activeListing.quantity} {activeListing.unit}</div>
                                </div>
                                <div className="ld-stat-card">
                                    <div className="ld-stat-label">MIN. ORDER</div>
                                    <div className="ld-stat-value">{activeListing.minimum_order_quantity} {activeListing.unit}</div>
                                </div>
                            </div>

                            <div className="ld-section">
                                <div className="ld-section-title">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                    LOCATION
                                </div>
                                <div className="ld-text">{[activeListing.locality, activeListing.city, activeListing.district, activeListing.state].filter(Boolean).join(', ')}</div>
                            </div>

                            <div className="ld-section">
                                <div className="ld-section-title">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                    FARMER
                                </div>
                                <div className="ld-farmer-card">
                                    <div className="ld-farmer-avatar">{activeListing.profiles?.full_name?.charAt(0) || 'F'}</div>
                                    <div className="ld-farmer-info">
                                        <div className="ld-farmer-name">{activeListing.profiles?.full_name || 'Farmer'}</div>
                                        <div className="ld-farmer-role">Local seller</div>
                                    </div>
                                </div>
                            </div>

                            {activeListing.description && (
                                <div className="ld-section">
                                    <div className="ld-section-title">ABOUT THIS PRODUCE</div>
                                    <div className="ld-text">{activeListing.description}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {reqSuccess ? (
                        <div className="ld-actions-fixed">
                            <div className="ld-success-state">
                                <div className="ld-success-icon">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                </div>
                                <h3>Request Sent</h3>
                                <p>The farmer has been notified and will respond soon.</p>
                                <button className="btn btn-buyer-primary w-100" style={{marginTop: '1.5rem', minHeight: '48px'}} onClick={() => setActiveListing(null)}>Back to Marketplace</button>
                            </div>
                        </div>
                    ) : (
                        <div className="ld-actions-fixed">
                            <div className="ld-qty-section">
                                <label className="ld-qty-label">REQUEST QUANTITY</label>
                                <div className="ld-qty-control">
                                    <button className="ld-qty-btn" type="button" onClick={() => setReqQty(Math.max(activeListing.minimum_order_quantity, Number(reqQty) - 1))}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                    </button>
                                    <div className="ld-qty-input-wrap">
                                        <input type="number" className="ld-qty-input" value={reqQty} onChange={e => setReqQty(e.target.value)} />
                                        <span className="ld-qty-unit">{activeListing.unit}</span>
                                    </div>
                                    <button className="ld-qty-btn" type="button" onClick={() => setReqQty(Math.min(activeListing.quantity, Number(reqQty) + 1))}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                        </svg>
                                    </button>
                                </div>
                                {reqError && <div className="ld-error">{reqError}</div>}
                            </div>
                            
                            <div className="ld-action-buttons">
                                <button 
                                    className="btn btn-buyer-primary ld-btn-primary" 
                                    onClick={handleAddToCart} 
                                    disabled={cartAdding || cartAdded}
                                >
                                    {cartAdding ? 'Adding...' : cartAdded ? 'Added to Cart!' : `Add to Cart — ₹${((Number(reqQty) || 0) * activeListing.price_per_unit).toFixed(2)}`}
                                </button>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
                                    <button className="btn btn-secondary ld-btn-secondary" onClick={submitRequest} disabled={reqProcessing}>
                                        {reqProcessing ? 'Reserving...' : 'Reserve only'}
                                    </button>
                                    <button className="btn btn-secondary ld-btn-secondary" onClick={() => setShowNegModal(true)}>
                                        Make an Offer
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* NEGOTIATION SHEET */}
        {showNegModal && activeListing && (
            <div className="modal-overlay listing-detail-overlay active">
                <div className="listing-detail-content buyer-bottom-sheet">
                    <button className="ld-close-btn" onClick={() => setShowNegModal(false)} aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                    
                    <div className="ld-scroll-area">
                        <div className="ld-body" style={{paddingTop: '3.5rem'}}>
                            <h2 style={{fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', marginBottom: '1.5rem', letterSpacing: '-0.02em'}}>Make an Offer</h2>

                            <div className="ld-neg-summary">
                                <div className="ld-neg-row">
                                    <span className="ld-neg-label">Farmer asking price</span>
                                    <span className="ld-neg-value">₹{activeListing.price_per_unit} / {activeListing.unit}</span>
                                </div>
                                <div className="ld-neg-row">
                                    <span className="ld-neg-label">Quantity</span>
                                    <span className="ld-neg-value">{reqQty} {activeListing.unit}</span>
                                </div>
                            </div>

                            {negError && <div className="ld-error" style={{marginBottom: '1rem'}}>{negError}</div>}

                            <div className="form-group" style={{marginBottom:'1.25rem'}}>
                                <label className="form-label" style={{display:'block', marginBottom:'0.375rem', fontSize:'0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '0.05em'}}>Your offer price (₹)</label>
                                <input type="number" className="form-control" step="0.01" style={{width:'100%', padding:'1rem', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', fontSize: '1.125rem', fontWeight: 600}} value={negPrice} onChange={e => setNegPrice(e.target.value)} />
                            </div>
                            
                            <div className="form-group" style={{marginBottom:'1rem'}}>
                                <label className="form-label" style={{display:'block', marginBottom:'0.375rem', fontSize:'0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '0.05em'}}>Message (optional)</label>
                                <textarea className="form-control" rows="3" placeholder="e.g. Can you do this price?" style={{width:'100%', padding:'1rem', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', resize: 'none', fontSize: '1rem'}} value={negMsg} onChange={e => setNegMsg(e.target.value)}></textarea>
                            </div>
                        </div>
                    </div>

                    <div className="ld-actions-fixed">
                        <button className="btn btn-buyer-primary ld-btn-primary" onClick={submitNegotiation} disabled={negProcessing}>
                            {negProcessing ? 'Sending Offer...' : 'Send Offer'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        
        <BuyerBottomNav />
    </div>
  );
}
