import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import BuyerBottomNav from '../../components/buyer/BuyerBottomNav';
import BuyerHeaderTop from '../../components/buyer/BuyerHeaderTop';

export default function BuyerNegotiations() {
  const { user } = useAuth();
  const [negotiations, setNegotiations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [activeNeg, setActiveNeg] = useState(null);
  const [offers, setOffers] = useState([]);
  const [showCounter, setShowCounter] = useState(false);
  const [counterData, setCounterData] = useState({ price: '', qty: '', msg: '' });
  const [counterError, setCounterError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const loadNegotiations = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: negData, error: negError } = await supabase
        .from('negotiations')
        .select(`
            *,
            listings ( produce_name, category, unit, quantity, minimum_order_quantity, price_per_unit ),
            profiles!fk_negotiation_farmer ( full_name, phone_number, locality, district, state )
        `)
        .eq('buyer_id', user.uid)
        .order('updated_at', { ascending: false });

      if (negError) throw negError;

      let negs = negData || [];
      if (negs.length > 0) {
        const negIds = negs.map(n => n.id);
        const { data: offersData, error: offersError } = await supabase
            .from('negotiation_offers')
            .select('*')
            .in('negotiation_id', negIds)
            .order('offer_number', { ascending: true });

        if (offersError) throw offersError;

        negs = negs.map(n => ({
            ...n,
            negotiation_offers: (offersData || []).filter(o => o.negotiation_id === n.id)
        }));
      }

      setNegotiations(negs);

      if (activeNeg) {
        const updated = negs.find(n => n.id === activeNeg.id);
        if (updated) {
            setActiveNeg(updated);
            setOffers(updated.negotiation_offers || []);
        }
      }
    } catch (err) {
      console.error(err);
      setError("Unable to load negotiations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadNegotiations();

      const sub1 = supabase.channel('buyer_neg_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'negotiations', filter: `buyer_id=eq.${user.uid}` }, loadNegotiations)
        .subscribe();
      
      const sub2 = supabase.channel('buyer_offer_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'negotiation_offers' }, loadNegotiations)
        .subscribe();

      return () => {
        supabase.removeChannel(sub1);
        supabase.removeChannel(sub2);
      };
    }
  }, [user]);

  const handleOpenNeg = (neg) => {
    setActiveNeg(neg);
    setOffers(neg.negotiation_offers || []);
    setShowCounter(false);
  };

  const handleCounterSubmit = async (e) => {
    e.preventDefault();
    setCounterError(null);
    setProcessing(true);

    const price = parseFloat(counterData.price);
    const qty = parseFloat(counterData.qty);
    const minOrder = activeNeg.listings?.minimum_order_quantity || 1;
    const maxOrder = activeNeg.listings?.quantity || 1000;

    if (isNaN(price) || price < 0) {
        setCounterError("Please enter a valid price.");
        setProcessing(false);
        return;
    }
    if (isNaN(qty) || qty < minOrder || qty > maxOrder) {
        setCounterError(`Quantity must be between ${minOrder} and ${maxOrder}.`);
        setProcessing(false);
        return;
    }

    try {
      const lastOffer = offers[offers.length - 1];

      const { data: offerData, error: offerErr } = await supabase
        .from('negotiation_offers')
        .insert({
            negotiation_id: activeNeg.id,
            offered_by: user.uid,
            price_per_unit: price,
            quantity: qty,
            message: counterData.msg,
            offer_number: offers.length + 1,
            offer_type: 'counter',
            status: 'pending'
        })
        .select().single();

      if (offerErr) throw offerErr;

      await supabase.from('negotiation_offers').update({ status: 'superseded' }).eq('id', lastOffer.id);
      
      await supabase.from('negotiations').update({
          current_offer_id: offerData.id,
          final_price_per_unit: price,
          final_quantity: qty,
          updated_at: new Date().toISOString()
      }).eq('id', activeNeg.id);

      setShowCounter(false);
      alert("Counter offer sent!");
    } catch (err) {
      console.error(err);
      setCounterError("Failed to send counter offer.");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!window.confirm("Are you sure you want to reject this offer? The negotiation will end.")) return;
    setProcessing(true);
    try {
        const lastOffer = offers[offers.length - 1];
        await supabase.from('negotiation_offers').update({ status: 'rejected' }).eq('id', lastOffer.id);
        await supabase.from('negotiations').update({ status: 'rejected' }).eq('id', activeNeg.id);
        alert("Negotiation rejected.");
        setActiveNeg(null);
    } catch (err) {
        console.error(err);
        alert("Failed to reject negotiation.");
    } finally {
        setProcessing(false);
    }
  };

  const handleAccept = async () => {
    if (!window.confirm("Accept this offer? This will automatically create an order.")) return;
    setProcessing(true);
    try {
        const lastOffer = offers[offers.length - 1];

        // 1. Create pending request based on the agreed offer
        const { data: reqRes, error: reqErr } = await supabase
            .from('requests')
            .insert({
                listing_id: activeNeg.listing_id,
                buyer_id: activeNeg.buyer_id,
                farmer_id: activeNeg.farmer_id,
                requested_quantity: lastOffer.quantity,
                unit: activeNeg.listings?.unit || 'unit',
                offered_price_per_unit: lastOffer.price_per_unit,
                status: 'pending'
            })
            .select().single();

        if (reqErr) throw reqErr;

        // 2. Use atomic reservation RPC to guarantee quantity and create the order
        const { data: rpcData, error: rpcErr } = await supabase.rpc('accept_reservation', { p_request_id: reqRes.id });
        if (rpcErr) {
            if (rpcErr.message && rpcErr.message.includes('Insufficient quantity')) {
                throw new Error("The farmer no longer has enough quantity available to fulfill this offer.");
            }
            throw rpcErr;
        }

        // 3. Mark negotiation and offer as accepted
        await supabase.from('negotiation_offers').update({ status: 'accepted' }).eq('id', lastOffer.id);
        await supabase.from('negotiations').update({ status: 'accepted' }).eq('id', activeNeg.id);

        // 4. Generate OTP
        if (rpcData && rpcData.order_id) {
            await supabase.rpc('generate_order_otp', {
                p_order_id: rpcData.order_id,
                p_caller_id: user.uid
            });
        }

        alert("Negotiation accepted! Order created.");
        setActiveNeg(null);
    } catch (err) {
        console.error(err);
        alert(err.message || "Failed to accept negotiation.");
    } finally {
        setProcessing(false);
    }
  };

  const filtered = filter === 'all' ? negotiations : negotiations.filter(n => n.status === filter);

  return (
    <div className="buyer-page buyer-app" id="buyer-app">
        {/* HEADER */}
        <header className="dash-header" style={{ background: 'var(--buyer-header-gradient)', paddingBottom: '1.5rem' }}>
            <BuyerHeaderTop />
            <div className="dash-header-greeting">
                <h1 style={{fontSize:'1.5rem'}}>My Offers</h1>
                <p>Manage your active negotiations</p>
            </div>
        </header>

        {/* STATUS FILTERS */}
        <div className="filter-container">
            {['all', 'active', 'accepted', 'rejected'].map(f => (
                <button 
                    key={f}
                    className={`filter-pill ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                    style={{textTransform: 'capitalize'}}
                >
                    {f}
                </button>
            ))}
        </div>

        {/* NEGOTIATIONS LIST */}
        <div className="negotiation-container">
            {loading ? (
                <div className="buyer-page-loader">
                    <div className="bpl-logo-wrap">
                        <img src="/assets/images/logo.png" alt="AnaajSetu" className="bpl-logo" />
                        <div className="bpl-ring"></div>
                    </div>
                    <div className="bpl-text">Loading offers...</div>
                </div>
            ) : error ? (
                <div className="empty-state" style={{marginTop:'1rem'}}>
                    <div className="empty-icon" style={{color:'var(--error)'}}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </div>
                    <h3>Error loading offers</h3>
                    <p>{error}</p>
                    <button className="btn btn-secondary mt-4" onClick={loadNegotiations}>Retry</button>
                </div>
            ) : filtered.length === 0 ? (
                <div className="empty-state" style={{marginTop:'1rem'}}>
                    <div className="empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                    </div>
                    <h3>No offers yet</h3>
                    <p>{filter === 'all' ? "You haven't made any offers on produce yet." : `You have no ${filter} offers.`}</p>
                    <Link to="/buyer" className="btn btn-primary mt-4" style={{display:'inline-block'}}>Discover produce</Link>
                </div>
            ) : (
                filtered.map(neg => {
                    const fName = neg.profiles?.full_name || 'Farmer';
                    const unit = neg.listings?.unit || 'unit';
                    const askingPrice = neg.listings?.price_per_unit || 0;
                    const latestOffer = neg.negotiation_offers[neg.negotiation_offers.length - 1];
                    const offerPrice = latestOffer ? latestOffer.price_per_unit : 0;
                    const offerQty = latestOffer ? latestOffer.quantity : 0;
                    const isActionRequired = neg.status === 'active' && latestOffer && latestOffer.offered_by !== user.uid;
                    
                    return (
                        <div key={neg.id} className="neg-card" onClick={() => handleOpenNeg(neg)}>
                            <div className="neg-header">
                                <div>
                                    <h3 className="neg-title">{neg.listings?.produce_name || 'Produce'}</h3>
                                    <div className="neg-subtitle">{fName}</div>
                                </div>
                                <span className={`neg-status-badge ${neg.status}`}>
                                    {neg.status.charAt(0).toUpperCase() + neg.status.slice(1)}
                                </span>
                            </div>
                            <div className="neg-body">
                                <div>
                                    <div className="neg-qty">{offerQty} {unit}</div>
                                    <div className="neg-price">Latest Offer: ₹{offerPrice}/{unit}</div>
                                </div>
                                <div style={{textAlign:'right'}}>
                                    <div className="neg-price">Asking: ₹{askingPrice}/{unit}</div>
                                </div>
                            </div>
                            <div className="neg-footer">
                                <span style={{color: isActionRequired ? 'var(--primary)' : 'var(--text-muted)', fontWeight: isActionRequired ? 600 : 'normal'}}>
                                    {neg.status === 'active' ? (isActionRequired ? 'Your turn to respond' : 'Waiting for farmer') : `Negotiation ${neg.status}`}
                                </span>
                                <span>{new Date(neg.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                            </div>
                        </div>
                    );
                })
            )}
        </div>

        {/* TIMELINE MODAL */}
        <div className={`timeline-modal ${activeNeg ? 'active' : ''}`}>
            {activeNeg && (
                <>
                    <div className="timeline-header">
                        <button className="btn-back" onClick={() => setActiveNeg(null)} aria-label="Back">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="19" y1="12" x2="5" y2="12"></line>
                                <polyline points="12 19 5 12 12 5"></polyline>
                            </svg>
                        </button>
                        <div className="timeline-title-area">
                            <h2>{activeNeg.listings?.produce_name}</h2>
                            <p>{activeNeg.profiles?.full_name}</p>
                        </div>
                    </div>

                    <div className="timeline-content">
                        {offers.map(offer => {
                            const isMine = offer.offered_by === user.uid;
                            const time = new Date(offer.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
                            const unit = activeNeg.listings?.unit || 'unit';
                            
                            return (
                                <div key={offer.id} className={`chat-bubble-container ${isMine ? 'mine' : 'theirs'}`}>
                                    <div className="chat-sender">{isMine ? 'You' : activeNeg.profiles?.full_name}</div>
                                    <div className="chat-bubble">
                                        <div className="chat-offer-price">₹{offer.price_per_unit} <span style={{fontSize:'1rem', fontWeight:'normal'}}>/ {unit}</span></div>
                                        <div className="chat-offer-qty">{offer.quantity} {unit}</div>
                                        {offer.message && <div className="chat-message">"{offer.message}"</div>}
                                        <div className="chat-time">{time}</div>
                                    </div>
                                </div>
                            );
                        })}
                        
                        {activeNeg.status !== 'active' && (
                            <div className={`negotiation-final-status ${activeNeg.status}`}>
                                {activeNeg.status === 'accepted' ? 'Offer Accepted - Order Created' : 'Negotiation Rejected'}
                            </div>
                        )}
                    </div>

                    {activeNeg.status === 'active' && (
                        <div className="timeline-actions">
                            {offers.length > 0 && offers[offers.length - 1].offered_by !== user.uid ? (
                                <>
                                    <div className="action-status-text">Your turn to respond</div>
                                    <div className="btn-group">
                                        <button className="btn btn-primary" onClick={handleAccept} disabled={processing}>Accept</button>
                                        <button className="btn btn-secondary" onClick={() => {
                                            const last = offers[offers.length - 1];
                                            setCounterData({ price: last?.price_per_unit || '', qty: last?.quantity || '', msg: '' });
                                            setShowCounter(true);
                                        }} disabled={processing || offers.filter(o => o.offer_type === 'counter').length >= 3}>Counter</button>
                                        <button className="btn" style={{background:'#fef2f2', color:'#ef4444', border:'1px solid #fecaca'}} onClick={handleReject} disabled={processing}>Reject</button>
                                    </div>
                                </>
                            ) : (
                                <div className="action-status-text" style={{marginBottom:0}}>Waiting for farmer's response</div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>

        {/* COUNTER SHEET */}
        <div className={`sheet-overlay ${showCounter ? 'active' : ''}`} onClick={() => setShowCounter(false)}></div>
        <div className={`counter-sheet ${showCounter ? 'active' : ''}`}>
            <div className="counter-header">
                <h3>Counter Offer <span className="counter-limit-badge">{offers.filter(o => o.offer_type === 'counter').length}/3</span></h3>
                <button className="btn-back" onClick={() => setShowCounter(false)}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            
            <form onSubmit={handleCounterSubmit}>
                <div className="form-group">
                    <label className="form-label">Price per {activeNeg?.listings?.unit || 'unit'} (₹)</label>
                    <input type="number" className="form-control" step="0.01" required value={counterData.price} onChange={e => setCounterData({...counterData, price: e.target.value})} />
                </div>
                <div className="form-group">
                    <label className="form-label">Quantity</label>
                    <input type="number" className="form-control" step="0.1" required value={counterData.qty} onChange={e => setCounterData({...counterData, qty: e.target.value})} />
                </div>
                <div className="form-group">
                    <label className="form-label">Message (optional)</label>
                    <textarea className="form-control" rows="2" placeholder="e.g. Can you do this price?" value={counterData.msg} onChange={e => setCounterData({...counterData, msg: e.target.value})}></textarea>
                </div>
                
                {counterError && <div className="form-text" style={{color:'var(--error)', marginBottom:'1rem'}}>{counterError}</div>}
                <button type="submit" className="btn btn-primary btn-block" disabled={processing} style={{width:'100%'}}>{processing ? 'Sending...' : 'Send Counter Offer'}</button>
            </form>
        </div>
        <BuyerBottomNav />
    </div>
  );
}
