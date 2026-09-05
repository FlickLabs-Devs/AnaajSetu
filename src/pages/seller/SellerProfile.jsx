import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import SellerBottomNav from '../../components/seller/SellerBottomNav';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { getFriendlyErrorMessage } from '../../utils/userMessages';
import FormErrorSummary from '../../components/common/FormErrorSummary';

export default function SellerProfile() {
  const { user, profile, updateProfile, logout } = useAuth();
  const [farmerProfile, setFarmerProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // Form State
  const [formData, setFormData] = useState({
    full_name: '',
    farm_name: '',
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
    if (user && profile?.role === 'farmer') {
      supabase.from('farmer_profiles').select('*').eq('user_id', user.uid).single()
        .then(({ data }) => { 
          if (data) {
            setFarmerProfile(data);
            setFormData(prev => ({ ...prev, farm_name: data.farm_name || '' }));
          }
        })
        .catch(err => console.error('Error loading farmer profile', err));
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
      formData.farm_name !== (farmerProfile?.farm_name || '') ||
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
      farm_name: farmerProfile?.farm_name || '',
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
      
      // 2. Update farmer_profiles
      if (formData.farm_name !== (farmerProfile?.farm_name || '')) {
        const { error: farmerError } = await supabase
          .from('farmer_profiles')
          .upsert({ user_id: user.uid, farm_name: formData.farm_name, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        if (farmerError) throw farmerError;
        setFarmerProfile(prev => ({ ...prev, farm_name: formData.farm_name }));
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
    const { id, value } = e.target;
    const fieldName = id.replace('profile-', '');
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
    <div className="loading-screen">
      <div className="spinner spinner-green"></div>
      <p style={{marginTop:'1rem', color:'var(--text-muted)'}}>Loading profile...</p>
    </div>
  );

  const initials = (profile.full_name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const locParts = [profile.locality, profile.district, profile.state].filter(Boolean);
  
  const hasChanges = 
    formData.full_name !== (profile?.full_name || '') ||
    formData.farm_name !== (farmerProfile?.farm_name || '') ||
    formData.phone_number !== (profile?.phone_number || '') ||
    formData.locality !== (profile?.locality || '') ||
    formData.district !== (profile?.district || '') ||
    formData.state !== (profile?.state || '');

  return (
    <div className="farmer-page seller-app seller-profile-page" id="seller-profile-page">
      {/* Profile Hero Header */}
      <div className="seller-profile-header" aria-label="Profile header">
        <div className="seller-profile-avatar" aria-hidden="true">{initials}</div>
        <div className="seller-profile-name">{profile.full_name}</div>
        <div className="seller-role-badge" style={{marginBottom: '1rem'}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true">
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
          </svg>
          <span>Farmer / Seller</span>
        </div>
        {!isEditing && (
          <button className="seller-btn seller-btn-outline" style={{borderRadius: 'var(--radius-full)', padding: '0.5rem 1.25rem', fontSize: '0.875rem'}} onClick={handleEditClick}>
            ✎ Edit Profile
          </button>
        )}
      </div>

      <div className="seller-profile-body">
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
              <label htmlFor="profile-farm_name" className="form-label">Farm Name (Optional)</label>
              <input
                id="profile-farm_name"
                type="text"
                className="form-control"
                value={formData.farm_name}
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
              <button type="button" className="seller-btn seller-btn-outline" style={{flex: 1}} onClick={handleCancelClick} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="seller-btn seller-btn-primary" style={{flex: 1}} disabled={saving || (!hasChanges)}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* View Mode */}
            <div className="profile-section-card" role="region" aria-label="Farm details">
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

            <div className="profile-section-card" role="region" aria-label="Farm details">
              <div className="profile-section-head">
                <h3>Farm Information</h3>
              </div>
              <ul className="profile-info-list">
                <li className="profile-info-item">
                  <div className="profile-info-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
                  </div>
                  <div className="profile-info-content">
                    <div className="profile-info-label">Farm Name</div>
                    <div className="profile-info-value">{farmerProfile?.farm_name || <span className="text-muted">Not added yet</span>}</div>
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

      <SellerBottomNav />
    </div>
  );
}
