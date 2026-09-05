import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { fetchLocationData } from '../../utils/locationData';

export default function Onboarding() {
  const { user, profile, updateProfile, loading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState(null);
  const [locationData, setLocationData] = useState([]);
  const [districts, setDistricts] = useState([]);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [farmName, setFarmName] = useState('');
  const [buyerType, setBuyerType] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [locality, setLocality] = useState('');

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
    if (!loading && profile && profile.role) {
       // already onboarded
       navigate(profile.role === 'farmer' ? '/seller' : '/buyer');
    }
    if (user && profile) {
      setFullName(profile.full_name || user.displayName || '');
      setPhoneNumber(profile.phone_number || '');
    }
  }, [user, profile, loading, navigate]);

  useEffect(() => {
    fetchLocationData().then(data => {
      setLocationData(data);
    });
  }, []);

  const handleStateChange = (e) => {
    const selectedState = e.target.value;
    setState(selectedState);
    setDistrict('');
    const found = locationData.find(st => (st.state || st.name) === selectedState);
    if (found && found.districts) {
      setDistricts(found.districts);
    } else {
      setDistricts([]);
    }
  };

  const handleNextStep = () => {
    if (selectedRole) {
      setStep(2);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!fullName) { setError("Please enter your full name."); return; }
    if (!phoneNumber) { setError("Please enter a valid phone number."); return; }
    if (!state) { setError("Please select your state."); return; }
    if (!district) { setError("Please select your district."); return; }
    if (!locality) { setError("Please enter your locality."); return; }

    if (selectedRole === 'buyer' && !buyerType) {
      setError("Please select the type of buyer you are.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Update common profile
      await updateProfile({
        full_name: fullName,
        phone_number: phoneNumber,
        role: selectedRole,
        state: state,
        district: district,
        locality: locality,
      });

      // 2. Role specific profile
      if (selectedRole === 'farmer') {
        await supabase.from('farmer_profiles').upsert(
            { user_id: user.uid, farm_name: farmName || null, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
        );
      } else if (selectedRole === 'buyer') {
        await supabase.from('buyer_profiles').upsert(
            { user_id: user.uid, buyer_type: buyerType, business_name: businessName || null, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
        );
      }

      setIsSuccess(true);
      setTimeout(() => {
        navigate(selectedRole === 'farmer' ? '/seller' : '/buyer');
      }, 1200);

    } catch (err) {
      console.error(err);
      setError("We couldn't save your profile. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (loading || (!user && !error)) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-green"></div>
        <span>Loading your account...</span>
      </div>
    );
  }

  return (
    <div className="onboarding-page">
      <Link to="/" className="ob-brand" style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
        <img src="/assets/images/logo.png" alt="AaharSetu" className="brand-logo" />
      </Link>

      {!isSuccess && (
        <div className="ob-progress">
          <div className={`ob-step-dot ${step === 1 ? 'active' : 'done'}`}></div>
          <div className={`ob-step-dot ${step === 2 ? 'active' : ''}`}></div>
        </div>
      )}

      <div className="ob-card">
        {error && <div className="alert alert-error" style={{ display: 'block' }}>{error}</div>}

        {step === 1 && !isSuccess && (
          <div>
            <div className="ob-step-header">
              <div className="ob-step-label">Step 1 of 2</div>
              <h1>How will you use AaharSetu?</h1>
              <p>Choose the option that best describes you. You can't change this later.</p>
            </div>

            <div className="role-grid">
              <div className={`role-card ${selectedRole === 'farmer' ? 'selected' : ''}`} onClick={() => setSelectedRole('farmer')}>
                <span className="role-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
                </span>
                <div className="role-card-title">I'm a Farmer</div>
                <div className="role-card-desc">List your available produce and connect with nearby buyers.</div>
              </div>
              <div className={`role-card ${selectedRole === 'buyer' ? 'selected' : ''}`} onClick={() => setSelectedRole('buyer')}>
                <span className="role-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                </span>
                <div className="role-card-title">I'm a Buyer</div>
                <div className="role-card-desc">Discover fresh produce from farmers right near you.</div>
              </div>
            </div>

            <button className="btn btn-primary btn-block" disabled={!selectedRole} onClick={handleNextStep}>
              Continue &rarr;
            </button>
          </div>
        )}

        {step === 2 && !isSuccess && (
          <div>
            <button className="ob-back-btn" onClick={() => setStep(1)} type="button">
              &larr; Back
            </button>

            <div className="ob-step-header">
              <div className="ob-step-label">Step 2 of 2</div>
              <h1>{selectedRole === 'farmer' ? 'Tell us about your farm' : 'Tell us about your business'}</h1>
              <p>{selectedRole === 'farmer' ? 'This helps buyers discover you.' : 'This helps farmers understand your needs.'}</p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="fullName" className="form-label">Full name</label>
                <input type="text" id="fullName" className="form-control" required value={fullName} onChange={e => setFullName(e.target.value)} />
              </div>

              {selectedRole === 'farmer' && (
                <div className="form-group">
                  <label htmlFor="farmName" className="form-label">Farm name <span className="text-faint">(optional)</span></label>
                  <input type="text" id="farmName" className="form-control" placeholder="e.g. Green Valley Farm" value={farmName} onChange={e => setFarmName(e.target.value)} />
                </div>
              )}

              {selectedRole === 'buyer' && (
                <>
                  <div className="form-group">
                    <label className="form-label">What type of buyer are you?</label>
                    <div className="buyer-type-grid">
                      {['restaurant', 'cafe', 'local_shop', 'hostel_canteen', 'food_processor', 'retailer', 'ngo_food_bank', 'household'].map(type => (
                        <div 
                          key={type} 
                          className={`buyer-type-pill ${buyerType === type ? 'selected' : ''}`}
                          onClick={() => setBuyerType(type)}
                        >
                          {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="businessName" className="form-label">Business / Organization name <span className="text-faint">(optional)</span></label>
                    <input type="text" id="businessName" className="form-control" placeholder="e.g. Spice Route Restaurant" value={businessName} onChange={e => setBusinessName(e.target.value)} />
                  </div>
                </>
              )}

              <div className="form-group">
                <label htmlFor="phoneNumber" className="form-label">Phone Number</label>
                <input type="tel" id="phoneNumber" className="form-control" placeholder="10-digit mobile number" required value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} />
              </div>

              <div className="form-group">
                <label htmlFor="loc-state" className="form-label">State</label>
                <select id="loc-state" className="form-control" required value={state} onChange={handleStateChange}>
                  <option value="" disabled>Select your state</option>
                  {locationData.map((st, i) => (
                    <option key={i} value={st.state || st.name}>{st.state || st.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="loc-district" className="form-label">District</label>
                <select id="loc-district" className="form-control" required disabled={!state} value={district} onChange={e => setDistrict(e.target.value)}>
                  <option value="" disabled>Select your district</option>
                  {districts.map((d, i) => (
                    <option key={i} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="loc-locality" className="form-label">Locality / Village</label>
                <input type="text" id="loc-locality" className="form-control" placeholder="e.g. Borbari" required value={locality} onChange={e => setLocality(e.target.value)} />
              </div>

              <button type="submit" className="btn btn-primary btn-block mt-4" disabled={isSubmitting}>
                {isSubmitting ? <span className="spinner" style={{ display: 'inline-block' }}></span> : <span>Finish setup</span>}
              </button>
            </form>
          </div>
        )}

        {isSuccess && (
          <div className="ob-success" style={{ display: 'block' }}>
            <span className="ob-success-icon" style={{ display: 'inline-block', marginBottom: '1rem' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48" style={{ color: 'var(--success)' }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </span>
            <h2>You're all set!</h2>
            <p className="text-muted mt-2">Taking you to your dashboard...</p>
          </div>
        )}
      </div>
    </div>
  );
}
