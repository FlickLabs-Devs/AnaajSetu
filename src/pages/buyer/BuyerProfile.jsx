import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import BuyerBottomNav from '../../components/buyer/BuyerBottomNav';

export default function BuyerProfile() {
  const { user, profile, logout } = useAuth();
  const [buyerProfile, setBuyerProfile] = useState(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (profile) {
      setPhoneInput(profile.phone_number || '');
    }
  }, [profile]);

  useEffect(() => {
    if (user && profile?.role === 'buyer') {
      supabase.from('buyer_profiles').select('*').eq('user_id', user.uid).single()
        .then(({ data }) => { if (data) setBuyerProfile(data); })
        .catch(err => console.error('Error loading buyer profile', err));
    }
  }, [user, profile]);

  const normalizePhone = (phone) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) return '+91' + cleaned;
    if (cleaned.length === 12 && cleaned.startsWith('91')) return '+' + cleaned;
    return null;
  };

  const handleSavePhone = async () => {
    setError('');
    setSuccess('');
    const newPhone = normalizePhone(phoneInput);
    if (!newPhone && phoneInput.trim()) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({ phone_number: newPhone }).eq('id', user.uid);
      if (error) throw error;
      setSuccess('Phone number saved successfully.');
    } catch (err) {
      console.error(err);
      setError('Failed to save phone number.');
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return (
    <div className="loading-screen">
      <div className="spinner spinner-indigo"></div>
    </div>
  );

  const initials = (profile.full_name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const locParts = [profile.locality, profile.city, profile.district].filter(Boolean);

  const bTypeMap = {
    restaurant: 'Restaurant', cafe: 'Café', local_shop: 'Local Shop',
    hostel_canteen: 'Hostel / Canteen', food_processor: 'Food Processor',
    retailer: 'Retailer', ngo_food_bank: 'NGO / Food Bank', household: 'Household'
  };
  const bType = buyerProfile ? (bTypeMap[buyerProfile.buyer_type] || buyerProfile.buyer_type) : null;

  return (
    <div className="buyer-page buyer-app buyer-profile-page" id="buyer-profile-page">
      {/* Profile Hero Header */}
      <div className="profile-header-card" aria-label="Profile header">
        <div className="profile-avatar" aria-hidden="true">{initials}</div>
        <div className="profile-name">{profile.full_name}</div>
        <div className="profile-role-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>Buyer</span>
        </div>
      </div>

      <div className="profile-body">
        {/* Personal Info */}
        <div className="profile-section-card" role="region" aria-label="Personal details">
          <div className="profile-section-head">
            <h3>Personal Details</h3>
          </div>
          <ul className="profile-info-list">
            {bType && (
              <li className="profile-info-item">
                <div className="profile-info-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>
                <div className="profile-info-content">
                  <div className="profile-info-label">Buyer Type</div>
                  <div className="profile-info-value">{bType}</div>
                </div>
              </li>
            )}
            {buyerProfile?.business_name && (
              <li className="profile-info-item">
                <div className="profile-info-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                </div>
                <div className="profile-info-content">
                  <div className="profile-info-label">Business Name</div>
                  <div className="profile-info-value">{buyerProfile.business_name}</div>
                </div>
              </li>
            )}
            <li className="profile-info-item">
              <div className="profile-info-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div className="profile-info-content">
                <div className="profile-info-label">Location</div>
                <div className="profile-info-value">{locParts.join(', ') || 'Not specified'}</div>
              </div>
            </li>
          </ul>
        </div>

        {/* Contact Info */}
        <div className="profile-section-card" role="region" aria-label="Contact information">
          <div className="profile-section-head">
            <h3>Contact Info</h3>
          </div>
          <div style={{ padding: '1rem' }}>
            <li className="profile-info-item" style={{ listStyle: 'none', border: 'none', padding: '0 0.125rem 1rem' }}>
              <div className="profile-info-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.11 12 19.79 19.79 0 0 1 1.04 3.4 2 2 0 0 1 3 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <div className="profile-info-content">
                <div className="profile-info-label">Phone Number</div>
                <div className="profile-info-value">{profile.phone_number || '—'}</div>
              </div>
            </li>

            {error && <div className="alert alert-error" style={{ display: 'block', marginBottom: '0.75rem' }}>{error}</div>}
            {success && <div className="alert alert-success" style={{ display: 'block', marginBottom: '0.75rem' }}>{success}</div>}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="profile-phone">Update Phone Number</label>
              <div className="profile-edit-row">
                <input
                  id="profile-phone"
                  type="tel"
                  className="form-control"
                  placeholder="10-digit number (e.g. 9876543210)"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                />
                <button
                  className="btn btn-buyer-primary"
                  onClick={handleSavePhone}
                  disabled={saving}
                  style={{ flexShrink: 0 }}
                >
                  {saving ? <span className="spinner" style={{ display: 'inline-block' }}></span> : 'Save'}
                </button>
              </div>
              <p className="form-help">Sellers use this number to coordinate pickup.</p>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          className="profile-logout-btn"
          onClick={logout}
          aria-label="Log out of AnaajSetu"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Log Out
        </button>
      </div>

      <BuyerBottomNav />
    </div>
  );
}
