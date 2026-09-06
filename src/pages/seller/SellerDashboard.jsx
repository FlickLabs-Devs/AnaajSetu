import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { sellerService } from '../../services/sellerService';
import SellerBottomNav from '../../components/seller/SellerBottomNav';
import { useConfirm } from '../../hooks/useConfirm';
import { useToast } from '../../hooks/useToast';

export default function SellerDashboard() {
  const { user, profile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [reputation, setReputation] = useState(null);
  const [farmerProfile, setFarmerProfile] = useState(null);
  
  const [selectedListing, setSelectedListing] = useState(null);
  const [showAllInsights, setShowAllInsights] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  
  const { confirm } = useConfirm();
  const { showToast } = useToast();

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        // Fetch farmer profile for farm name
        const { data: fpData } = await supabase
          .from('farmer_profiles')
          .select('*')
          .eq('user_id', user.uid)
          .maybeSingle();
        setFarmerProfile(fpData);

        const fetchedListings = await sellerService.getFarmerListings(user.uid);
        setListings(fetchedListings);
        
        const analyticsData = await sellerService.getDashboardAnalytics(user.uid);
        setAnalytics(analyticsData);

        const repData = await sellerService.getReputation(user.uid);
        setReputation(repData);
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    const channel = supabase.channel('farmer_listings_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings', filter: `farmer_id=eq.${user.uid}` }, 
      async () => {
        const fresh = await sellerService.getFarmerListings(user.uid);
        setListings(fresh);
      }).subscribe();

    const handleGlobalClick = () => setOpenMenuId(null);
    document.addEventListener('click', handleGlobalClick);

    return () => { 
      supabase.removeChannel(channel); 
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [user]);

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      await sellerService.updateListingStatus(id, user.uid, newStatus);
      setListings(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
    } catch (e) {
      console.error(e);
      showToast({ title: 'Error', message: 'Could not update status.', type: 'error' });
    }
  };

  const handleDeleteClick = async (listing) => {
    try {
      const isConfirmed = await confirm({
        title: 'Delete this listing?',
        message: 'Are you sure you want to delete this listing? This action cannot be undone.',
        confirmText: 'Delete Listing',
        cancelText: 'Cancel',
        isDanger: true,
        loadingText: 'Deleting...',
        action: async () => {
          await sellerService.deleteListing(listing.id, user.uid, listing.listing_images);
        }
      });

      if (isConfirmed) {
        setListings(prev => prev.filter(l => l.id !== listing.id));
        if (selectedListing?.id === listing.id) setSelectedListing(null);
        showToast({
          type: 'success',
          title: "Listing deleted",
          message: "Your listing has been removed successfully."
        });
      }
    } catch (e) {
      if (e.message === 'HAS_ACTIVE_TRANSACTIONS') {
        showToast({
          type: 'error',
          title: "Couldn't delete listing",
          message: "This listing has active orders or requests. Please mark it as 'Paused' or 'Sold Out' instead."
        });
      } else {
        showToast({
          type: 'error',
          title: "Couldn't delete listing",
          message: "We couldn't remove this listing right now. Please try again."
        });
      }
    }
  };

  const activeCount = listings.filter(l => l.status === 'active').length;
  const pausedCount = listings.filter(l => l.status === 'paused').length;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };
  const firstName = profile?.full_name?.split(' ')[0] || 'Farmer';

  const farmName = farmerProfile?.farm_name;
  const locationParts = [profile?.locality, profile?.district].filter(Boolean);
  const locationText = locationParts.join(', ');
  let farmSubtext = 'Your farm';
  if (farmName && locationText) farmSubtext = `${farmName} · ${locationText}`;
  else if (farmName) farmSubtext = farmName;
  else if (locationText) farmSubtext = locationText;

  if (loading) {
    return (
      <div className="farmer-page seller-app">
        <header className="dash-header">
            <div className="dash-header-top">
                <Link to="/" className="dash-brand"><img src="/assets/images/logo.png" alt="AaharSetu" /></Link>
            </div>
            <div className="dash-header-greeting">
                <div className="skeleton skeleton-title w-50" style={{ background: 'rgba(255,255,255,0.15)', height: '1.4rem', marginBottom: '0.4rem', borderRadius: '6px' }}></div>
                <div className="skeleton skeleton-text w-75" style={{ background: 'rgba(255,255,255,0.1)', height: '0.9rem', borderRadius: '6px' }}></div>
            </div>
        </header>
        <div style={{ padding: '1rem' }}><div className="skeleton" style={{ height: '300px', borderRadius: '8px' }}></div></div>
      </div>
    );
  }

  return (
    <div className="farmer-page seller-app">
      <header className="dash-header">
        <div className="dash-header-top">
          <Link to="/" className="dash-brand" aria-label="AaharSetu Home">
            <img src="/assets/images/logo.png" alt="AaharSetu" />
          </Link>
          <Link to="/seller/profile" className="dash-profile-btn" aria-label="My Profile">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </Link>
        </div>

        <div className="dash-header-greeting">
          <h1>{getGreeting()}, {firstName}</h1>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', margin: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{ opacity: 0.8, flexShrink: 0 }}>
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
            </svg>
            <span>{farmSubtext}</span>
          </p>
        </div>
      </header>

      <div className="stats-strip">
        <div className="stat-card">
          <div className="stat-icon stat-icon--active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          </div>
          <div className="stat-value">{activeCount}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon--paused">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          </div>
          <div className="stat-value">{pausedCount}</div>
          <div className="stat-label">Paused</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon--total">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
          </div>
          <div className="stat-value">{listings.length}</div>
          <div className="stat-label">Total</div>
        </div>
      </div>

      <section className={`farm-insights ${showAllInsights ? 'show-all' : ''}`}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem'}}>
          <h2 style={{margin: 0}}>Farm Insights</h2>
          <button 
            className="farm-insights-toggle text-seller font-semibold" 
            style={{background: 'none', border: 'none', padding: 0, fontSize: '0.875rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem'}}
            onClick={() => setShowAllInsights(!showAllInsights)}
          >
            {showAllInsights ? 'Show less ↑' : 'View all ↓'}
          </button>
        </div>
        <div className="farm-insights-grid">
          <div className="farm-insight-card">
            <div className="farm-insight-label">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              Total Sales
            </div>
            <div className="farm-insight-value">{analytics ? `₹${analytics.sales.total.toLocaleString('en-IN')}` : 'Loading...'}</div>
            <div className="farm-insight-detail">{analytics ? `Across ${analytics.sales.count} orders` : '\u00A0'}</div>
          </div>
          <div className="farm-insight-card">
            <div className="farm-insight-label">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              Buyer Demand
            </div>
            <div className="farm-insight-value">{analytics ? `${analytics.demand.total} requests` : 'Loading...'}</div>
            <div className="farm-insight-detail">{analytics ? `${analytics.demand.pending} pending · ${analytics.demand.accepted} accepted` : '\u00A0'}</div>
          </div>
          <div className="farm-insight-card insight-extra">
            <div className="farm-insight-label">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>
              Most Requested
            </div>
            <div className="farm-insight-value">{analytics ? (analytics.mostRequested.name || 'No requests yet') : 'Loading...'}</div>
            <div className="farm-insight-detail">{analytics?.mostRequested.count > 0 ? `${analytics.mostRequested.count} requests` : '\u00A0'}</div>
          </div>
          <div className="farm-insight-card insight-extra">
            <div className="farm-insight-label">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
              Top Selling
            </div>
            <div className="farm-insight-value">{analytics ? (analytics.topSelling.name || 'No sales yet') : 'Loading...'}</div>
            <div className="farm-insight-detail">{analytics?.topSelling.qty > 0 ? `${analytics.topSelling.qty} ${analytics.topSelling.unit} sold` : '\u00A0'}</div>
          </div>
          <div className="farm-insight-card insight-extra">
            <div className="farm-insight-label">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              Negotiations
            </div>
            <div className="farm-insight-value">{analytics ? `${analytics.negotiations.active} active` : 'Loading...'}</div>
            <div className="farm-insight-detail">{analytics ? `${analytics.negotiations.accepted} deals accepted` : '\u00A0'}</div>
          </div>
          <div className="farm-insight-card insight-extra">
            <div className="farm-insight-label">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              Your Reputation
            </div>
            <div className="farm-insight-value">
              {reputation ? (
                reputation.review_count === 0 ? 'New' : 
                <>{parseFloat(reputation.average_rating).toFixed(1)} <span style={{fontSize:'1rem', color:'#f59e0b'}}>★</span></>
              ) : 'Loading...'}
            </div>
            <div className="farm-insight-detail">
              {reputation ? (reputation.review_count === 0 ? 'No reviews yet' : `${reputation.review_count} review${reputation.review_count !== 1 ? 's' : ''}`) : '\u00A0'}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Your Produce</h2>
          <Link to="/seller/listings/new" className="seller-btn seller-btn-primary seller-btn-sm" style={{ display: 'inline-flex' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Produce
          </Link>
        </div>
        
        <div className="seller-listings-container">
          {listings.length === 0 ? (
            <div className="empty-state" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <div className="empty-icon" style={{ marginBottom: '1rem', color: 'var(--text-faint)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/>
                        <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
                    </svg>
                </div>
                <h3>No produce listed yet</h3>
                <p>Add your first listing and let nearby buyers discover what you have available.</p>
                <Link to="/seller/listings/new" className="btn btn-primary mt-4">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add Produce
                </Link>
            </div>
          ) : (
            listings.map(listing => {
              const sortedImgs = (listing.listing_images || []).slice().sort((a,b) => a.sort_order - b.sort_order);
              const imgSrc = sortedImgs[0]?.image_url;
              const statusLabel = { active: 'Active', paused: 'Paused', sold_out: 'Sold Out' }[listing.status] || listing.status;

              return (
                <div key={listing.id} className="card listing-card" onClick={() => { setOpenMenuId(null); setSelectedListing(listing); }}>
                  
                  <div className="lc-image">
                    {imgSrc ? <img src={imgSrc} alt={listing.produce_name} loading="lazy" /> : (
                      <div className="lc-image-placeholder">
                        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" fill="none" strokeWidth="2"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      </div>
                    )}
                    <span className={`badge badge-${listing.status}`} style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', zIndex: 1 }}>{statusLabel}</span>
                    
                    <button className="lc-menu-btn" style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 10 }} aria-label="Listing actions" onClick={(e) => {
                       e.stopPropagation();
                       setOpenMenuId(prev => prev === listing.id ? null : listing.id);
                    }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                    </button>
                  </div>

                  <div className="lc-body">
                    <div className="lc-header">
                      <h3 className="lc-title">{listing.produce_name}</h3>
                    </div>
                    <div className="lc-meta text-muted">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      {listing.locality || listing.city || listing.district}
                    </div>
                    <div className="lc-price-qty">
                      <span className="lc-price">₹{listing.price_per_unit} <span>/ {listing.unit}</span></span>
                      <span className="lc-qty">{listing.quantity} {listing.unit} left</span>
                    </div>
                  </div>

                  <div className={`lc-dropdown ${openMenuId === listing.id ? 'active' : ''}`} style={{ position: 'absolute', top: '2.875rem', right: '0.5rem', zIndex: 1000 }} onClick={e => e.stopPropagation()}>
                    <Link to={`/seller/listings/edit/${listing.id}`} className="lc-dropdown-item">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Edit
                    </Link>
                    
                    {listing.status === 'paused' ? (
                      <button className="lc-dropdown-item" onClick={() => { setOpenMenuId(null); handleUpdateStatus(listing.id, 'active'); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Resume
                      </button>
                    ) : (
                      <button className="lc-dropdown-item" onClick={() => { setOpenMenuId(null); handleUpdateStatus(listing.id, 'paused'); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause
                      </button>
                    )}

                    {listing.status !== 'sold_out' ? (
                      <button className="lc-dropdown-item" onClick={() => { setOpenMenuId(null); handleUpdateStatus(listing.id, 'sold_out'); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> Mark sold out
                      </button>
                    ) : (
                      <button className="lc-dropdown-item" onClick={() => { setOpenMenuId(null); handleUpdateStatus(listing.id, 'active'); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg> Reactivate
                      </button>
                    )}

                    <button className="lc-dropdown-item lc-dropdown-item--danger text-danger" onClick={() => { setOpenMenuId(null); handleDeleteClick(listing); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg> Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Listing Detail Modal */}
      {selectedListing && (() => {
        const sortedImages = (selectedListing.listing_images || []).slice().sort((a,b) => a.sort_order - b.sort_order);
        const lStatus = { active: 'Active', paused: 'Paused', sold_out: 'Sold Out' }[selectedListing.status] || selectedListing.status;
        const start = new Date(selectedListing.availability_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const end = new Date(selectedListing.availability_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return (
          <div className="modal-overlay listing-detail-overlay active" onClick={(e) => { if (e.target === e.currentTarget) setSelectedListing(null); }}>
            <div className="listing-detail-content">
              <button className="ld-close-btn" onClick={() => setSelectedListing(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>

              <div className="ld-scroll-area">
                <div className="ld-gallery-container">
                  <div className="ld-gallery">
                    {sortedImages.length > 0 ? sortedImages.map(img => <img key={img.id} src={img.image_url} alt="produce" />) : (
                      <div className="lc-image-placeholder" style={{ width: '100%', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-alt)' }}>
                        <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" fill="none" strokeWidth="2"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      </div>
                    )}
                  </div>
                </div>

                <div className="ld-body">
                  <div className="ld-header">
                    <h2>{selectedListing.produce_name}</h2>
                    <span className={`lc-status lc-status--${selectedListing.status}`}>{lStatus}</span>
                  </div>
                  <div className="ld-subtitle">{selectedListing.category} · {selectedListing.quality}</div>
                  <div className="ld-price">₹{selectedListing.price_per_unit} / {selectedListing.unit}</div>

                  <div className="ld-grid">
                    <div className="ld-grid-item">
                      <span className="ld-label">Available</span>
                      <span className="ld-value">{selectedListing.quantity} {selectedListing.unit}</span>
                    </div>
                    <div className="ld-grid-item">
                      <span className="ld-label">Min. Order</span>
                      <span className="ld-value">{selectedListing.minimum_order_quantity || 1} {selectedListing.unit}</span>
                    </div>
                  </div>

                  <div className="ld-section">
                    <span className="ld-label">Location</span>
                    <div className="ld-text">{selectedListing.locality}, {selectedListing.district}, {selectedListing.state}</div>
                  </div>

                  <div className="ld-section">
                    <span className="ld-label">Availability Window</span>
                    <div className="ld-text">{start} to {end}</div>
                  </div>

                  {selectedListing.description && (
                    <div className="ld-section">
                      <span className="ld-label">Description</span>
                      <div className="ld-text">{selectedListing.description}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="ld-actions-fixed">
                <div className="ld-action-grid">
                  <Link to={`/seller/listings/edit/${selectedListing.id}`} className="btn btn-secondary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ marginRight: '0.25rem' }}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Edit
                  </Link>
                  {selectedListing.status === 'active' ? (
                    <button className="btn btn-secondary" onClick={() => { handleUpdateStatus(selectedListing.id, 'paused'); setSelectedListing(null); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ marginRight: '0.25rem' }}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={() => { handleUpdateStatus(selectedListing.id, 'active'); setSelectedListing(null); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ marginRight: '0.25rem' }}><polygon points="5 3 19 12 5 21 5 3"/></svg> Resume
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <SellerBottomNav />
    </div>
  );
}
