import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

export default function SellerNegotiations() {
  const { user } = useAuth();
  const [negotiations, setNegotiations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [activeNeg, setActiveNeg] = useState(null);
  const [offers, setOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);
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
            profiles!fk_negotiation_buyer ( full_name, phone_number, locality, district, state )
        `)
        .eq('farmer_id', user.uid)
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

      // Update active neg if open
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

      const sub1 = supabase.channel('farmer_neg_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'negotiations', filter: `farmer_id=eq.${user.uid}` }, loadNegotiations)
        .subscribe();
      
      const sub2 = supabase.channel('farmer_offer_changes')
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
    if (!window.confirm("Accept this offer? This will automatically create an order and deduct quantity.")) return;
    setProcessing(true);
    try {
        const lastOffer = offers[offers.length - 1];

        // Create pending request
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

        // Use RPC to accept it atomically
        const { data: rpcData, error: rpcErr } = await supabase.rpc('accept_reservation', { p_request_id: reqRes.id });
        if (rpcErr) {
            if (rpcErr.message && rpcErr.message.includes('Insufficient quantity')) {
                throw new Error("You don't have enough quantity available to accept this offer.");
            }
            throw rpcErr;
        }

        // Mark offer & neg as accepted
        await supabase.from('negotiation_offers').update({ status: 'accepted' }).eq('id', lastOffer.id);
        await supabase.from('negotiations').update({ status: 'accepted' }).eq('id', activeNeg.id);

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
    <div className="farmer-page seller-app">
      <header className="seller-page-header">
        <h1 style={{margin:0}}>Negotiations</h1>
      </header>

      <div style={{paddingBottom: '1rem'}}>
        <div className="seller-filter-bar">
          {['all', 'active', 'accepted', 'rejected'].map(f => (
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
            <div className="empty-icon">💬</div>
            <h3 className="empty-title">No negotiations yet</h3>
            <p className="empty-text text-muted">When buyers counter your price, it will appear here.</p>
          </div>
        ) : (
          <div style={{display:'grid', gridTemplateColumns:'1fr', gap:'1rem', padding:'0 var(--page-padding-x)'}}>
            {filtered.map(neg => {
              const bName = neg.profiles?.full_name || 'Buyer';
              const unit = neg.listings?.unit || 'unit';
              const askingPrice = neg.listings?.price_per_unit || 0;
              const latestOffer = neg.negotiation_offers[neg.negotiation_offers.length - 1];
              const offerPrice = latestOffer ? latestOffer.price_per_unit : 0;
              const offerQty = latestOffer ? latestOffer.quantity : 0;
              const isActionRequired = neg.status === 'active' && latestOffer && latestOffer.offered_by !== user.uid;
              const counters = neg.negotiation_offers.filter(o => o.offer_type === 'counter').length;

              let statusText = neg.status.charAt(0).toUpperCase() + neg.status.slice(1);
              if (neg.status === 'active' && latestOffer) {
                statusText = latestOffer.offered_by === user.uid ? 'Waiting for buyer' : 'Your response required';
              }

              return (
                <div key={neg.id} style={{background:'var(--surface)', borderRadius:'var(--radius-lg)', padding:'1.25rem', border:'1px solid var(--border)', boxShadow: 'var(--shadow-xs)'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                      <div>
                          <h3 style={{margin:'0 0 0.25rem 0', fontSize:'1.125rem'}}>{neg.listings?.produce_name || 'Produce'}</h3>
                          <div className="text-muted" style={{fontSize:'0.85rem'}}>Buyer: {bName}</div>
                      </div>
                      {neg.status === 'active' && isActionRequired ? (
                          <span className="seller-badge seller-badge-pending">Action Required</span>
                      ) : (
                          <span className={`seller-badge seller-badge-${neg.status}`}>{neg.status}</span>
                      )}
                  </div>
                  
                  <div style={{display:'flex', flexDirection:'column', gap:'0.5rem', marginTop:'1rem'}}>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                          <span className="text-muted" style={{fontSize:'0.875rem'}}>Buyer offer</span>
                          <span style={{fontWeight:600}}>₹{offerPrice} / {unit} &times; {offerQty} {unit}</span>
                      </div>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                          <span className="text-muted" style={{fontSize:'0.875rem'}}>Your asking price</span>
                          <span>₹{askingPrice} / {unit}</span>
                      </div>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                          <span className="text-muted" style={{fontSize:'0.875rem'}}>Status</span>
                          <span style={{color: isActionRequired ? 'var(--seller-primary)' : 'var(--text)', fontWeight: isActionRequired ? 600 : 'normal'}}>{statusText}</span>
                      </div>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid var(--border)', paddingTop:'0.75rem', marginTop:'0.5rem'}}>
                          <span className="text-muted" style={{fontSize:'0.875rem'}}>Counter offers</span>
                          <span style={{fontWeight:600}}>{counters} / 3</span>
                      </div>
                  </div>
                  
                  <button className="seller-btn seller-btn-outline seller-btn-block" style={{marginTop:'1.25rem'}} onClick={() => handleOpenNeg(neg)}>View Offer</button>
                </div>
              );
            })}
          </div>
        )}
           {activeNeg && (
        <div className="seller-modal-overlay active" onClick={(e) => { if (e.target.className.includes('seller-modal-overlay')) setActiveNeg(null); }}>
          <div className="seller-modal-content">
            
            <header className="seller-modal-header">
                <button className="seller-back-btn" onClick={() => setActiveNeg(null)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <div>
                    <h2 className="seller-modal-title">{activeNeg.listings?.produce_name}</h2>
                    <div className="text-muted" style={{fontSize:'0.85rem'}}>Negotiating with {activeNeg.profiles?.full_name}</div>
                </div>
            </header>

            <div className="seller-modal-body" style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
                {offers.map(offer => {
                    const isMine = offer.offered_by === user.uid;
                    const time = new Date(offer.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
                    const unit = activeNeg.listings?.unit || 'unit';
                    return (
                        <div key={offer.id} style={{alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth:'85%'}}>
                            <div style={{fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'0.25rem', textAlign: isMine ? 'right' : 'left'}}>{isMine ? 'You' : activeNeg.profiles?.full_name}</div>
                            <div style={{background: isMine ? 'var(--seller-primary)' : 'var(--surface-alt)', color: isMine ? 'white' : 'var(--text)', padding:'1rem', borderRadius:'var(--radius-lg)', border: '1px solid var(--border)'}}>
                                <div style={{fontSize:'1.2rem', fontWeight:700}}>₹{offer.price_per_unit} <span style={{fontSize:'0.8rem', fontWeight:'normal', opacity:0.9}}>/ {unit}</span></div>
                                <div style={{fontWeight:600}}>{offer.quantity} {unit}</div>
                                {offer.message && <div style={{marginTop:'0.5rem', fontStyle:'italic', opacity:0.9}}>"{offer.message}"</div>}
                                <div style={{fontSize:'0.7rem', textAlign:'right', marginTop:'0.5rem', opacity:0.7}}>{time}</div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="seller-modal-footer">
                {activeNeg.status === 'active' ? (
                    (() => {
                        const lastOffer = offers[offers.length - 1];
                        const isMyTurn = lastOffer?.offered_by !== user.uid;
                        const counters = offers.filter(o => o.offer_type === 'counter').length;

                        if (!isMyTurn) {
                            return <div style={{textAlign:'center', width: '100%', color:'var(--seller-primary)', fontWeight:600}}>Waiting for buyer's response...</div>;
                        }

                        return (
                            <div style={{display:'flex', flexDirection:'column', gap:'0.75rem', width: '100%'}}>
                                <div style={{display:'flex', gap:'0.75rem'}}>
                                    <button className="seller-btn seller-btn-danger" style={{flex:1}} disabled={processing} onClick={handleReject}>Reject</button>
                                    <button className="seller-btn seller-btn-primary" style={{flex:2}} disabled={processing} onClick={handleAccept}>Accept Offer</button>
                                </div>
                                {counters >= 3 ? (
                                    <div style={{textAlign:'center', color:'var(--danger)', fontSize:'0.85rem'}}>Maximum counter-offer limit reached.</div>
                                ) : (
                                    <button className="seller-btn seller-btn-outline seller-btn-block" disabled={processing} onClick={() => {
                                        setCounterData({ price: lastOffer?.price_per_unit || '', qty: lastOffer?.quantity || '', msg: '' });
                                        setShowCounter(true);
                                    }}>Send Counter Offer</button>
                                )}
                            </div>
                        );
                    })()
                ) : (
                    <div style={{textAlign:'center', width: '100%', fontWeight:600, color: activeNeg.status === 'accepted' ? 'var(--success)' : 'var(--danger)'}}>
                        Negotiation {activeNeg.status}
                    </div>
                )}
            </div>
          </div>
        </div>
      )}
      </div>

      {showCounter && (
        <div className="seller-modal-overlay active">
            <div className="seller-modal-content" style={{maxWidth:'400px', margin:'auto'}}>
                <header className="seller-modal-header" style={{justifyContent: 'space-between'}}>
                    <h3 className="seller-modal-title">Counter Offer</h3>
                    <button className="seller-back-btn" onClick={() => setShowCounter(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </header>
                <div className="seller-modal-body">
                  <form onSubmit={handleCounterSubmit}>
                      {counterError && <div className="alert alert-error" style={{display:'block', marginBottom: '1rem'}}>{counterError}</div>}
                      <div className="form-group" style={{marginBottom: '1.25rem'}}>
                          <label className="form-label" style={{display: 'block', marginBottom: '0.5rem', fontWeight: 600}}>Price per {activeNeg.listings?.unit} (₹)</label>
                          <input type="number" className="form-control" style={{width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)'}} required value={counterData.price} onChange={e => setCounterData({...counterData, price: e.target.value})} />
                      </div>
                      <div className="form-group" style={{marginBottom: '1.25rem'}}>
                          <label className="form-label" style={{display: 'block', marginBottom: '0.5rem', fontWeight: 600}}>Quantity ({activeNeg.listings?.unit})</label>
                          <input type="number" className="form-control" style={{width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)'}} required value={counterData.qty} onChange={e => setCounterData({...counterData, qty: e.target.value})} />
                          <div className="text-muted" style={{fontSize:'0.75rem', marginTop:'0.5rem'}}>Available: {activeNeg.listings?.quantity} {activeNeg.listings?.unit}</div>
                      </div>
                      <div className="form-group" style={{marginBottom: '1.5rem'}}>
                          <label className="form-label" style={{display: 'block', marginBottom: '0.5rem', fontWeight: 600}}>Message (Optional)</label>
                          <input type="text" className="form-control" style={{width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)'}} placeholder="E.g. Final price, take it or leave it" value={counterData.msg} onChange={e => setCounterData({...counterData, msg: e.target.value})} />
                      </div>
                      <button type="submit" className="seller-btn seller-btn-primary seller-btn-block" disabled={processing}>{processing ? 'Sending...' : 'Send Counter Offer'}</button>
                  </form>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
