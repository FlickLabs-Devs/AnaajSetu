import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../hooks/useToast';
import { getFriendlyErrorMessage } from '../../utils/userMessages';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

export default function SellerRequests() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [activeRequest, setActiveRequest] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'accept' | 'reject', req }
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: requestsData, error: reqError } = await supabase
        .from('requests')
        .select('*')
        .eq('farmer_id', user.uid)
        .order('created_at', { ascending: false });

      if (reqError) throw reqError;
      
      if (!requestsData || requestsData.length === 0) {
        setRequests([]);
        return;
      }

      const buyerIds = [...new Set(requestsData.map(r => r.buyer_id).filter(Boolean))];
      const listingIds = [...new Set(requestsData.map(r => r.listing_id).filter(Boolean))];

      let profiles = [], buyerProfiles = [], listings = [];
      
      if (buyerIds.length > 0) {
        const [profRes, buyerProfRes] = await Promise.all([
            supabase.from('profiles').select('id, full_name, phone_number, city, locality, district').in('id', buyerIds),
            supabase.from('buyer_profiles').select('user_id, business_name, buyer_type').in('user_id', buyerIds)
        ]);
        profiles = profRes.data || [];
        buyerProfiles = buyerProfRes.data || [];
      }
      
      if (listingIds.length > 0) {
        const listRes = await supabase.from('listings').select('id, produce_name, category').in('id', listingIds);
        listings = listRes.data || [];
      }

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      const buyerProfileMap = new Map((buyerProfiles || []).map(p => [p.user_id, p]));
      const listingMap = new Map((listings || []).map(l => [l.id, l]));

      const fullData = requestsData.map(req => ({
        ...req,
        profiles: profileMap.get(req.buyer_id) || null,
        buyer_profiles: buyerProfileMap.get(req.buyer_id) || null,
        listings: listingMap.get(req.listing_id) || null
      }));

      setRequests(fullData);
    } catch (err) {
      console.error(err);
      setError("Couldn't load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadRequests();

      const channel = supabase.channel('farmer_requests_changes')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'requests',
            filter: `farmer_id=eq.${user.uid}`
        }, () => {
            loadRequests();
        })
        .subscribe();
        
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const handleAction = async () => {
    if (!confirmAction) return;
    const { type, req } = confirmAction;
    setProcessing(true);
    
    try {
      if (type === 'accept') {
        // Use the new atomic RPC to accept reservation and decrement quantity
        const { data, error } = await supabase.rpc('accept_reservation', { p_request_id: req.id, p_farmer_id: user.uid });
        if (error) {
            // Check if it's the custom error from the RPC
            if (error.message && error.message.includes('Insufficient quantity')) {
                throw new Error("You don't have enough quantity available to accept this request.");
            }
            throw error;
        }
        
        // The RPC creates the order, so we just generate the OTP
        if (data && data.order_id) {
            await supabase.rpc('generate_order_otp', {
                p_order_id: data.order_id,
                p_caller_id: user.uid
            });
        }
      } else {
        // Rejecting is safe to do normally since it doesn't affect quantity
        const { error } = await supabase
            .from('requests')
            .update({ status: 'rejected' })
            .eq('id', req.id)
            .eq('farmer_id', user.uid);
        if (error) throw error;
      }
      
      setActiveRequest(null);
      setConfirmAction(null);
      loadRequests();
      showToast({ type: 'success', title: `Request ${type}ed`, message: `The request was ${type}ed successfully.` });
    } catch (err) {
      console.error(err);
      showToast({ type: 'error', title: 'Action failed', message: getFriendlyErrorMessage(err) });
    } finally {
      setProcessing(false);
    }
  };

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  return (
    <div className="farmer-page seller-app">
      <header className="seller-page-header">
        <button type="button" className="seller-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h1 className="seller-page-title" style={{margin:0}}>Requests</h1>
      </header>

      <div style={{paddingBottom: '1rem'}}>
        <div className="seller-filter-bar">
          {['pending', 'accepted', 'completed', 'cancelled', 'rejected', 'all'].map(f => (
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
            <div className="empty-icon">📋</div>
            <h3 className="empty-title">No requests yet</h3>
            <p className="empty-text text-muted">{filter === 'all' ? "When buyers request your produce, you'll see their requests here." : `You have no ${filter} requests.`}</p>
          </div>
        ) : (
          <div style={{display:'flex', flexDirection:'column', gap:'1rem', padding:'0 var(--page-padding-x)'}}>
            {filtered.map(req => {
              const totalVal = (req.requested_quantity * req.offered_price_per_unit).toFixed(0);
              const bName = req.profiles?.full_name || 'Buyer';
              const bType = (req.buyer_profiles?.business_name || req.buyer_profiles?.buyer_type || 'Buyer').replace(/_/g, ' ');
              const date = new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

              return (
                <div key={req.id} style={{background:'var(--surface)', borderRadius:'var(--radius-lg)', padding:'1.25rem', border:'1px solid var(--border)', cursor: 'pointer', boxShadow: 'var(--shadow-xs)'}} onClick={() => setActiveRequest(req)}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.75rem'}}>
                      <div>
                          <h3 style={{margin:'0 0 0.25rem 0', fontSize:'1.125rem'}}>
                            {req.listings?.produce_name || 'Produce'}
                            {req.message === 'Cart Purchase' && (
                              <span style={{ fontSize: '0.7rem', background: 'var(--success-bg, #dcfce7)', color: 'var(--success, #16a34a)', padding: '0.125rem 0.5rem', borderRadius: '1rem', marginLeft: '0.5rem', verticalAlign: 'middle' }}>Direct purchase</span>
                            )}
                          </h3>
                          <div className="text-muted" style={{fontSize:'0.85rem'}}>{bName} · <span style={{textTransform:'capitalize'}}>{bType}</span></div>
                      </div>
                      <span className={`seller-badge seller-badge-${req.status}`}>{req.status}</span>
                  </div>
                  
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'1rem'}}>
                      <div>
                          <div style={{fontWeight:700, fontSize:'1.0rem', color: 'var(--text)'}}>{req.requested_quantity} {req.unit}</div>
                          <div className="text-muted" style={{fontSize:'0.85rem'}}>₹{req.offered_price_per_unit} / {req.unit}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                          <div className="text-muted" style={{fontSize:'0.8rem'}}>Value</div>
                          <div style={{fontWeight:800, color:'var(--seller-primary)', fontSize:'1.125rem'}}>₹{totalVal}</div>
                      </div>
                  </div>
                  <div style={{borderTop:'1px solid var(--border)', marginTop:'0.875rem', paddingTop:'0.75rem', display:'flex', justifyContent:'space-between', fontSize:'0.85rem'}} className="text-muted">
                      <span>Requested {date}</span>
                      {req.status === 'pending' && <span style={{color:'var(--seller-primary)', fontWeight:600}}>Review &rarr;</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {activeRequest && !confirmAction && (
        <div className="seller-modal-overlay active" onClick={(e) => { if (e.target.className.includes('seller-modal-overlay')) setActiveRequest(null); }}>
          <div className="seller-modal-content">
            <header className="seller-modal-header">
                <button className="seller-back-btn" onClick={() => setActiveRequest(null)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <div>
                    <h2 className="seller-modal-title">
                        {activeRequest.listings?.produce_name}
                        {activeRequest.message === 'Cart Purchase' && (
                            <span style={{ fontSize: '0.75rem', background: 'var(--success-bg, #dcfce7)', color: 'var(--success, #16a34a)', padding: '0.15rem 0.5rem', borderRadius: '1rem', marginLeft: '0.5rem', verticalAlign: 'middle', fontWeight: 600 }}>Direct purchase</span>
                        )}
                    </h2>
                    <div className="text-muted" style={{fontSize:'0.85rem'}}>Requested on {new Date(activeRequest.created_at).toLocaleDateString()}</div>
                </div>
            </header>
            <div className="seller-modal-body">
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1.5rem'}}>
                <div style={{background: 'var(--surface-alt)', padding: '1rem', borderRadius: 'var(--radius-md)'}}>
                  <div className="text-muted" style={{fontSize:'0.8rem', marginBottom: '0.25rem'}}>Quantity</div>
                  <div style={{fontWeight:600}}>{activeRequest.requested_quantity} {activeRequest.unit}</div>
                </div>
                <div style={{background: 'var(--surface-alt)', padding: '1rem', borderRadius: 'var(--radius-md)'}}>
                  <div className="text-muted" style={{fontSize:'0.8rem', marginBottom: '0.25rem'}}>Offer Price</div>
                  <div style={{fontWeight:600}}>₹{activeRequest.offered_price_per_unit} / {activeRequest.unit}</div>
                </div>
                <div style={{background: 'var(--surface-alt)', padding: '1rem', borderRadius: 'var(--radius-md)', gridColumn: '1 / -1'}}>
                  <div className="text-muted" style={{fontSize:'0.8rem', marginBottom: '0.25rem'}}>Total Value</div>
                  <div style={{fontWeight:700, color:'var(--seller-primary)', fontSize: '1.25rem'}}>₹{(activeRequest.requested_quantity * activeRequest.offered_price_per_unit).toFixed(0)}</div>
                </div>
              </div>

              <div style={{background:'var(--surface-alt)', padding:'1rem', borderRadius:'var(--radius-lg)', marginBottom:'1.5rem', border: '1px solid var(--border)'}}>
                <h4 style={{margin:'0 0 0.5rem 0', fontSize:'0.9375rem'}}>Buyer Details</h4>
                <div style={{fontWeight:600, marginBottom: '0.25rem'}}>{activeRequest.profiles?.full_name}</div>
                <div className="text-muted" style={{fontSize:'0.85rem', textTransform:'capitalize', marginBottom: '0.25rem'}}>{(activeRequest.buyer_profiles?.business_name || activeRequest.buyer_profiles?.buyer_type || '').replace(/_/g, ' ')}</div>
                <div className="text-muted" style={{fontSize:'0.85rem'}}>{[activeRequest.profiles?.locality, activeRequest.profiles?.city].filter(Boolean).join(', ')}</div>
              </div>
            </div>
            
            <div className="seller-modal-footer">
              {activeRequest.status === 'pending' ? (
                <div style={{display:'flex', gap:'1rem', width: '100%'}}>
                  <button className="seller-btn seller-btn-outline" style={{flex:1}} onClick={() => setConfirmAction({type:'reject', req: activeRequest})}>Reject</button>
                  <button className="seller-btn seller-btn-primary" style={{flex:1}} onClick={() => setConfirmAction({type:'accept', req: activeRequest})}>Accept</button>
                </div>
              ) : (
                <button className="seller-btn seller-btn-outline seller-btn-block" onClick={() => setActiveRequest(null)}>Close</button>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="seller-modal-overlay active">
          <div className="seller-modal-content" style={{maxWidth:'360px', margin:'auto', borderRadius:'var(--radius-xl)'}}>
            <div className="seller-modal-body" style={{textAlign:'center', padding: '2rem 1.5rem'}}>
                <h3 style={{marginTop:0, marginBottom: '0.5rem'}}>{confirmAction.type === 'accept' ? 'Accept Request?' : 'Reject Request?'}</h3>
                <p className="text-muted" style={{fontSize:'0.9375rem', marginBottom:'1.5rem', lineHeight: 1.5}}>
                {confirmAction.type === 'accept' 
                    ? `You are about to accept ${confirmAction.req.requested_quantity} ${confirmAction.req.unit} for ${confirmAction.req.profiles?.full_name}. This will deduct quantity from your listing.`
                    : `Are you sure you want to reject this request from ${confirmAction.req.profiles?.full_name}?`
                }
                </p>
                <div style={{display:'flex', gap:'1rem', marginTop:'2rem'}}>
                <button className="seller-btn seller-btn-outline" style={{flex:1}} disabled={processing} onClick={() => setConfirmAction(null)}>Cancel</button>
                <button className={`seller-btn ${confirmAction.type === 'accept' ? 'seller-btn-primary' : 'seller-btn-danger'}`} style={{flex:1}} disabled={processing} onClick={handleAction}>
                    {processing ? '...' : 'Confirm'}
                </button>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
