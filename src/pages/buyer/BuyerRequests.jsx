import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import BuyerBottomNav from '../../components/buyer/BuyerBottomNav';

export default function BuyerRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [cancelling, setCancelling] = useState(false);
  const [cancelId, setCancelId] = useState(null);
  const [error, setError] = useState(null);

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: reqData, error: reqError } = await supabase
        .from('requests')
        .select('*')
        .eq('buyer_id', user.uid)
        .order('created_at', { ascending: false });

      if (reqError) throw reqError;
      
      let mappedRequests = [];
      if (reqData && reqData.length > 0) {
        const farmerIds = [...new Set(reqData.map(r => r.farmer_id).filter(Boolean))];
        const listingIds = [...new Set(reqData.map(r => r.listing_id).filter(Boolean))];

        const [farmersRes, listingsRes] = await Promise.all([
          farmerIds.length ? supabase.from('profiles').select('id, full_name, locality, district').in('id', farmerIds) : { data: [] },
          listingIds.length ? supabase.from('listings').select('id, produce_name, category, locality, district').in('id', listingIds) : { data: [] }
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

        mappedRequests = reqData.map(r => {
          const ls = listingsMap[r.listing_id] || null;
          if (ls) ls.listing_images = imagesMap[r.listing_id] || [];
          return {
            ...r,
            profiles: farmersMap[r.farmer_id] || null,
            listings: ls
          };
        });
      }

      setRequests(mappedRequests);
    } catch (err) {
      console.error(err);
      setError("Unable to load requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadRequests();
      const channel = supabase.channel('buyer_requests_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: `buyer_id=eq.${user.uid}` }, loadRequests)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  const handleCancel = async () => {
    if (!cancelId) return;
    setCancelling(true);
    try {
      const { error } = await supabase.from('requests').update({ status: 'cancelled' }).eq('id', cancelId);
      if (error) throw error;
      setCancelId(null);
    } catch (err) {
      console.error(err);
      alert("Failed to cancel request.");
    } finally {
      setCancelling(false);
    }
  };

  const filteredRequests = statusFilter === 'all' 
    ? requests 
    : requests.filter(r => r.status === statusFilter);

  return (
    <div className="buyer-app buyer-requests-page" id="buyer-app">
        {/* HEADER */}
        <header className="dash-header" style={{ background: 'var(--buyer-header-gradient)', paddingBottom: '1.5rem' }}>
            <div className="dash-header-top">
                <Link to="/buyer" className="dash-brand" aria-label="Back to Marketplace">
                    <img src="/assets/images/logo.png" alt="AnaajSetu" />
                </Link>
                <Link to="/buyer/profile" className="dash-profile-btn" aria-label="My Profile">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                    </svg>
                </Link>
            </div>
            <div className="dash-header-greeting">
                <h1 style={{fontSize:'1.5rem'}}>My Requests</h1>
                <p>Track your reserved marketplace produce</p>
            </div>
        </header>

        {/* STATUS FILTERS */}
        <div className="buyer-filter-container">
            {['all', 'pending', 'accepted', 'rejected', 'cancelled'].map(status => (
                <button 
                    key={status}
                    className={`buyer-filter-pill ${statusFilter === status ? 'active' : ''}`} 
                    onClick={() => setStatusFilter(status)}
                >
                    {status}
                </button>
            ))}
        </div>

        {/* Requests Grid */}
        <div className="buyer-req-list">
            {loading ? (
                <div style={{textAlign:'center', padding:'2rem'}}>
                    <div className="spinner spinner-primary"></div>
                </div>
            ) : error ? (
                <div className="buyer-empty-state">
                    <div className="empty-icon" style={{color:'var(--error)'}}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </div>
                    <h3>Error loading requests</h3>
                    <p>{error}</p>
                    <button className="btn btn-secondary mt-4" onClick={loadRequests}>Retry</button>
                </div>
            ) : filteredRequests.length === 0 ? (
                <div className="buyer-empty-state">
                    <div className="empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                    </div>
                    <h3>No requests yet</h3>
                    <p>Your produce requests will appear here once you reserve something from the marketplace.</p>
                    <Link to="/buyer" className="btn btn-buyer-primary mt-4" style={{textDecoration:'none', display:'inline-block'}}>Browse Marketplace</Link>
                </div>
            ) : (
                filteredRequests.map(req => {
                    const listing = req.listings;
                    const date = new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                    
                    let statusClass = 'status-pending';
                    if (req.status === 'accepted') statusClass = 'status-accepted';
                    else if (req.status === 'rejected' || req.status === 'cancelled') statusClass = 'status-rejected';
                    else if (req.status === 'negotiating') statusClass = 'status-negotiating';
                    else if (req.status === 'order') statusClass = 'status-order';
                    
                    const imgUrl = listing?.listing_images?.[0]?.image_url;
                    
                    return (
                        <div key={req.id} className="buyer-request-card">
                            <div className="brc-top">
                                <div className="brc-image-wrap">
                                    {imgUrl ? (
                                        <img src={imgUrl} alt={listing?.produce_name} className="brc-image" />
                                    ) : (
                                        <div className="brc-image-placeholder">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                                <polyline points="21 15 16 10 5 21"></polyline>
                                            </svg>
                                        </div>
                                    )}
                                </div>
                                <div className="brc-info">
                                    <h3 className="brc-title">{listing?.produce_name || 'Marketplace Produce'}</h3>
                                    <div className="brc-seller">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                        {req.profiles?.full_name || 'Unknown Seller'}
                                    </div>
                                    <div className="brc-meta-grid">
                                        <div className="brc-meta-item">
                                            <span className="brc-meta-label">Quantity</span>
                                            <span className="brc-meta-value">{req.requested_quantity} {req.unit}</span>
                                        </div>
                                        <div className="brc-meta-item">
                                            <span className="brc-meta-label">Price</span>
                                            <span className="brc-meta-price">₹{req.offered_price_per_unit} / {req.unit}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="brc-footer">
                                <div className="brc-footer-left">
                                    <span className="brc-date">{date}</span>
                                    <span className={`brc-status-badge ${statusClass}`}>{req.status}</span>
                                </div>
                                {req.status === 'pending' && (
                                    <div className="brc-actions">
                                        <button className="btn btn-outline-danger btn-sm" onClick={() => setCancelId(req.id)}>
                                            Cancel
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })
            )}
        </div>

        {/* CANCEL MODAL */}
        {cancelId && (
            <div className="modal-overlay">
                <div className="modal-content text-center" style={{maxWidth:'340px'}}>
                    <div style={{width:'56px', height:'56px', background:'var(--danger-bg)', color:'var(--danger)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1.25rem'}}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </div>
                    <h3 style={{fontSize:'1.125rem', marginBottom:'0.5rem', color:'var(--text)'}}>Cancel Request?</h3>
                    <p className="text-muted" style={{fontSize:'0.875rem', marginBottom:'1.5rem', lineHeight:1.5}}>Are you sure you want to cancel this request? This action cannot be undone.</p>
                    <div style={{display:'flex', gap:'0.75rem'}}>
                        <button className="btn btn-secondary flex-1" disabled={cancelling} onClick={() => setCancelId(null)}>Keep it</button>
                        <button className="btn btn-danger flex-1" disabled={cancelling} onClick={handleCancel}>
                            {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        <BuyerBottomNav />
    </div>
  );
}
