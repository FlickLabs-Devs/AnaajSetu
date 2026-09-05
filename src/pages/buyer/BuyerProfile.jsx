import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import BuyerBottomNav from '../../components/buyer/BuyerBottomNav';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { getFriendlyErrorMessage } from '../../utils/userMessages';
import FormErrorSummary from '../../components/common/FormErrorSummary';

export default function BuyerProfile() {
  const { user, profile, updateProfile, logout } = useAuth();
  const [buyerProfile, setBuyerProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // Form State
  const [formData, setFormData] = useState({
    full_name: '',
    business_name: '',
    buyer_type: 'household',
    phone_number: '',
    locality: '',
    district: '',
    state: ''
  });
  
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (profile) {
      setFormData(prev => ({
        ...prev,
        full_name: profile.full_name || '',
        phone_number: profile.phone_number || '',
        locality: profile.locality || '',
        district: profile.district || '',
        state: profile.state || ''
      }));
    }
  }, [profile]);

  useEffect(() => {
    if (user && profile?.role === 'buyer') {
      supabase.from('buyer_profiles').select('*').eq('user_id', user.uid).single()
        .then(({ data }) => { 
          if (data) {
            setBuyerProfile(data);
            setFormData(prev => ({ 
              ...prev, 
              business_name: data.business_name || '',
              buyer_type: data.buyer_type || 'household'
            }));
          }
        })
        .catch(err => console.error('Error loading buyer profile', err));
    }
  }, [user, profile]);

  const normalizePhone = (phone) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) return '+91' + cleaned;
    if (cleaned.length === 12 && cleaned.startsWith('91')) return '+' + cleaned;
    return phone;
  };

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleCancelClick = async () => {
    const hasChanges = 
      formData.full_name !== (profile?.full_name || '') ||
      formData.business_name !== (buyerProfile?.business_name || '') ||
      formData.buyer_type !== (buyerProfile?.buyer_type || 'household') ||
      formData.phone_number !== (profile?.phone_number || '') ||
      formData.locality !== (profile?.locality || '') ||
      formData.district !== (profile?.district || '') ||
      formData.state !== (profile?.state || '');
      
    if (hasChanges) {
      const isConfirmed = await confirm({
        title: "Discard changes?",
        message: "Your changes haven't been saved.",
        confirmText: "Discard Changes",
        cancelText: "Keep Editing",
        isDanger: true
      });
      if (!isConfirmed) return;
    }
    
    // Reset form data
    setFormData({
      full_name: profile?.full_name || '',
      business_name: buyerProfile?.business_name || '',
      buyer_type: buyerProfile?.buyer_type || 'household',
      phone_number: profile?.phone_number || '',
      locality: profile?.locality || '',
      district: profile?.district || '',
      state: profile?.state || ''
    });
    setFormErrors({});
    setIsEditing(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormErrors({});
    
    const errors = {};
    if (!formData.full_name.trim()) errors.full_name = "Please enter your name.";
    
    const newPhone = normalizePhone(formData.phone_number);
    if (!newPhone && formData.phone_number.trim()) {
      errors.phone_number = "Please enter a valid phone number.";
    } else if (newPhone && !newPhone.startsWith('+91') && newPhone.replace(/\D/g, '').length !== 10) {
      errors.phone_number = "Please enter a valid 10-digit phone number.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSaving(true);
    try {
      // 1. Update main profile
      const profileUpdates = {
        full_name: formData.full_name,
        phone_number: newPhone || null,
        locality: formData.locality,
        district: formData.district,
        state: formData.state
      };
      await updateProfile(profileUpdates);
      
      // 2. Update buyer_profiles
      if (formData.business_name !== (buyerProfile?.business_name || '') || formData.buyer_type !== (buyerProfile?.buyer_type || 'household')) {
        const { error: buyerError } = await supabase
          .from('buyer_profiles')
          .upsert({ 
            user_id: user.uid, 
            business_name: formData.business_name,
            buyer_type: formData.buyer_type,
            updated_at: new Date().toISOString() 
          }, { onConflict: 'user_id' });
        if (buyerError) throw buyerError;
        setBuyerProfile(prev => ({ 
          ...prev, 
          business_name: formData.business_name,
          buyer_type: formData.buyer_type
        }));
      }

      showToast({ type: 'success', title: 'Profile updated', message: 'Your profile changes have been saved successfully.' });
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      showToast({ type: 'error', title: "Couldn't save changes", message: getFriendlyErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { id, name, value } = e.target;
    const fieldName = name || id.replace('profile-', '');
    setFormData(prev => ({ ...prev, [fieldName]: value }));
    if (formErrors[fieldName]) {
      setFormErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs[fieldName];
        return newErrs;
      });
    }
  };

  if (!profile) return (
    <div className="buyer-page-loader full-screen">
      <div className="bpl-logo-wrap">
        <img src="/assets/images/logo.png" alt="AnaajSetu" className="bpl-logo" />
        <div className="bpl-ring"></div>
      </div>
      <div className="bpl-text">Loading profile...</div>
    </div>
  );

  const initials = (profile.full_name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const locParts = [profile.locality, profile.district, profile.state].filter(Boolean);
  
  const bTypeMap = {
    restaurant: 'Restaurant', cafe: 'Café', local_shop: 'Local Shop',
    hostel_canteen: 'Hostel / Canteen', food_processor: 'Food Processor',
    retailer: 'Retailer', ngo_food_bank: 'NGO / Food Bank', household: 'Household'
  };
  const displayBuyerType = buyerProfile ? (bTypeMap[buyerProfile.buyer_type] || buyerProfile.buyer_type) : null;
  
  const hasChanges = 
    formData.full_name !== (profile?.full_name || '') ||
    formData.business_name !== (buyerProfile?.business_name || '') ||
    formData.buyer_type !== (buyerProfile?.buyer_type || 'household') ||
    formData.phone_number !== (profile?.phone_number || '') ||
    formData.locality !== (profile?.locality || '') ||
    formData.district !== (profile?.district || '') ||
    formData.state !== (profile?.state || '');

  return (
    <div className="buyer-page buyer-app buyer-profile-page" id="buyer-profile-page">
      {/* Profile Hero Header */}
      <div className="profile-header-card" aria-label="Profile header">
        <div className="profile-avatar" aria-hidden="true">{initials}</div>
        <div className="profile-name">{profile.full_name}</div>
        <div className="profile-role-badge" style={{marginBottom: '1rem'}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>Buyer</span>
        </div>
        {!isEditing && (
          <button className="btn btn-buyer-primary buyer-profile-edit-btn" onClick={handleEditClick}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" aria-hidden="true" style={{marginRight: '0.25rem'}}>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Edit Profile
          </button>
        )}
      </div>

      <div className="profile-body">
        {isEditing ? (
          <form className="profile-section-card" style={{padding: '1.5rem'}} onSubmit={handleSave}>
            <h3 style={{marginTop: 0, marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: 700}}>Edit Profile</h3>
            
            <FormErrorSummary errors={Object.keys(formErrors).map(key => ({ fieldId: `profile-${key}`, message: formErrors[key] }))} />

            <div className="form-group">
              <label htmlFor="profile-full_name" className="form-label">Full Name</label>
              <input
                id="profile-full_name"
                type="text"
                className="form-control"
                value={formData.full_name}
                onChange={handleChange}
                aria-invalid={!!formErrors.full_name}
                aria-describedby={formErrors.full_name ? "profile-full_name-error" : undefined}
              />
              {formErrors.full_name && (
                <div id="profile-full_name-error" className="form-error-msg" role="alert">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  {formErrors.full_name}
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="profile-phone_number" className="form-label">Phone Number</label>
              <input
                id="profile-phone_number"
                type="tel"
                className="form-control"
                value={formData.phone_number}
                onChange={handleChange}
                placeholder="10-digit number"
                aria-invalid={!!formErrors.phone_number}
                aria-describedby={formErrors.phone_number ? "profile-phone_number-error" : undefined}
              />
              {formErrors.phone_number && (
                <div id="profile-phone_number-error" className="form-error-msg" role="alert">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  {formErrors.phone_number}
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="profile-buyer_type" className="form-label">Buyer Type</label>
              <select
                id="profile-buyer_type"
                name="buyer_type"
                className="form-control"
                value={formData.buyer_type}
                onChange={handleChange}
              >
                {Object.entries(bTypeMap).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="profile-business_name" className="form-label">Business Name (Optional)</label>
              <input
                id="profile-business_name"
                type="text"
                className="form-control"
                value={formData.business_name}
                onChange={handleChange}
              />
            </div>

            <h4 style={{marginTop: '2rem', marginBottom: '1rem', fontSize: '1rem', color: 'var(--text)'}}>Address</h4>

            <div className="form-group">
              <label htmlFor="profile-locality" className="form-label">Locality / Village</label>
              <input
                id="profile-locality"
                type="text"
                className="form-control"
                value={formData.locality}
                onChange={handleChange}
              />
            </div>
            
            <div className="form-group" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
                <div>
                  <label htmlFor="profile-district" className="form-label">District</label>
                  <input
                    id="profile-district"
                    type="text"
                    className="form-control"
                    value={formData.district}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label htmlFor="profile-state" className="form-label">State</label>
                  <input
                    id="profile-state"
                    type="text"
                    className="form-control"
                    value={formData.state}
                    onChange={handleChange}
                  />
                </div>
            </div>

            <div style={{display: 'flex', gap: '1rem', marginTop: '2rem'}}>
              <button type="button" className="btn btn-secondary" style={{flex: 1}} onClick={handleCancelClick} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn btn-buyer-primary" style={{flex: 1}} disabled={saving || (!hasChanges)}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Personal Info */}
            <div className="profile-section-card" role="region" aria-label="Personal details">
              <div className="profile-section-head">
                <h3>Personal Information</h3>
              </div>
              <ul className="profile-info-list">
                <li className="profile-info-item">
                  <div className="profile-info-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <div className="profile-info-content">
                    <div className="profile-info-label">Full Name</div>
                    <div className="profile-info-value">{profile.full_name || <span className="text-muted">Not added yet</span>}</div>
                  </div>
                </li>
                <li className="profile-info-item">
                  <div className="profile-info-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.11 12 19.79 19.79 0 0 1 1.04 3.4 2 2 0 0 1 3 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  </div>
                  <div className="profile-info-content">
                    <div className="profile-info-label">Phone Number</div>
                    <div className="profile-info-value">{profile.phone_number || <span className="text-muted">Not added yet</span>}</div>
                  </div>
                </li>
              </ul>
            </div>

            <div className="profile-section-card" role="region" aria-label="Business details">
              <div className="profile-section-head">
                <h3>Business Information</h3>
              </div>
              <ul className="profile-info-list">
                <li className="profile-info-item">
                  <div className="profile-info-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                  </div>
                  <div className="profile-info-content">
                    <div className="profile-info-label">Buyer Type</div>
                    <div className="profile-info-value">{displayBuyerType || <span className="text-muted">Not added yet</span>}</div>
                  </div>
                </li>
                <li className="profile-info-item">
                  <div className="profile-info-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                  </div>
                  <div className="profile-info-content">
                    <div className="profile-info-label">Business Name</div>
                    <div className="profile-info-value">{buyerProfile?.business_name || <span className="text-muted">Not added yet</span>}</div>
                  </div>
                </li>
              </ul>
            </div>

            <div className="profile-section-card" role="region" aria-label="Location details">
              <div className="profile-section-head">
                <h3>Location</h3>
              </div>
              <ul className="profile-info-list">
                <li className="profile-info-item">
                  <div className="profile-info-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <div className="profile-info-content">
                    <div className="profile-info-label">Address</div>
                    <div className="profile-info-value" style={{lineHeight: 1.5}}>
                      {locParts.length > 0 ? (
                        <>
                          {profile.locality && <div>{profile.locality}</div>}
                          {profile.district && <div>{profile.district}</div>}
                          {profile.state && <div>{profile.state}</div>}
                        </>
                      ) : (
                        <span className="text-muted">Not added yet</span>
                      )}
                    </div>
                  </div>
                </li>
              </ul>
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
          </>
        )}
      </div>

      <BuyerBottomNav />
    </div>
  );
}
