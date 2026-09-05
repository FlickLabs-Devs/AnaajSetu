import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { fetchLocationData } from '../../utils/locationData';
import imageCompression from 'browser-image-compression';
import MandiReference from '../../components/seller/MandiReference';
import { useToast } from '../../hooks/useToast';
import FormErrorSummary from '../../components/common/FormErrorSummary';
import { getFriendlyErrorMessage } from '../../utils/userMessages';

const MAX_IMAGES = 3;
const STORAGE_BUCKET = 'listings';

export default function ListingForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [btnText, setBtnText] = useState(id ? 'Save Changes' : 'Publish Listing');

  // Form State
  const [formData, setFormData] = useState({
    produceName: '', category: '', quantity: '', unit: 'kg', minOrder: '',
    price: '', quality: 'good', availableFrom: '', availableUntil: '',
    state: '', district: '', city: '', locality: '', description: ''
  });

  const [images, setImages] = useState([]); // { isExisting, id?, url?, storage_path?, file?, previewUrl? }
  
  // Validation State
  const [fieldErrors, setFieldErrors] = useState({});
  const [formErrorsList, setFormErrorsList] = useState([]);
  const [focusTrigger, setFocusTrigger] = useState(0); // To re-trigger focus on error summary
  
  // Location Data
  const [locationTree, setLocationTree] = useState([]);
  const [districts, setDistricts] = useState([]);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    
    const initData = async () => {
      try {
        const locations = await fetchLocationData();
        setLocationTree(locations);

        if (id) {
          const { data, error } = await supabase
            .from('listings')
            .select(`*, listing_images(*)`)
            .eq('id', id)
            .eq('farmer_id', user.uid)
            .single();

          if (error || !data) throw error || new Error("Listing not found");

          setFormData({
            produceName: data.produce_name || '',
            category: data.category || '',
            quantity: data.quantity || '',
            unit: data.unit || 'kg',
            minOrder: data.minimum_order_quantity || 1,
            price: data.price_per_unit || '',
            quality: data.quality || 'good',
            availableFrom: data.availability_start || '',
            availableUntil: data.availability_end || '',
            state: data.state || '',
            district: data.district || '',
            city: data.city || '',
            locality: data.locality || '',
            description: data.description || ''
          });

          // Set districts for loaded state
          const stateObj = locations.find(s => s.state === data.state);
          if (stateObj) setDistricts(stateObj.districts);

          if (data.listing_images && data.listing_images.length > 0) {
            data.listing_images.sort((a, b) => a.sort_order - b.sort_order);
            setImages(data.listing_images.map(img => ({
              isExisting: true, id: img.id, url: img.image_url, storage_path: img.storage_path
            })));
          }

        } else {
          // Pre-fill location
          if (profile?.state) {
            const stateObj = locations.find(s => s.state === profile.state);
            if (stateObj) setDistricts(stateObj.districts);
            setFormData(prev => ({
              ...prev,
              state: profile.state || '',
              district: profile.district || '',
              city: profile.district || '',
              locality: profile.locality || ''
            }));
          }
        }
      } catch (err) {
        console.error(err);
        showToast({
          type: 'error',
          title: 'Could not load listing',
          message: getFriendlyErrorMessage(err)
        });
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, [user, id, profile, showToast]);

  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
    
    // Clear field error when user interacts
    if (fieldErrors[id]) {
        setFieldErrors(prev => ({ ...prev, [id]: undefined }));
    }

    if (id === 'state') {
      const stateObj = locationTree.find(s => s.state === value);
      setDistricts(stateObj ? stateObj.districts : []);
      setFormData(prev => ({ ...prev, district: '' }));
      if (fieldErrors.district) {
         setFieldErrors(prev => ({ ...prev, district: undefined }));
      }
    }
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    if (images.length + files.length > MAX_IMAGES) {
      showToast({ type: 'warning', title: 'Limit Reached', message: `You can only upload a maximum of ${MAX_IMAGES} images.` });
      return;
    }

    const MAX_SIZE_MB = 5;
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        showToast({ type: 'error', title: 'Invalid File', message: `Invalid file format: ${file.name}. Only JPG, PNG, and WEBP are allowed.` });
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        showToast({ type: 'error', title: 'File too large', message: `File ${file.name} is too large. Maximum size is ${MAX_SIZE_MB}MB.` });
        return;
      }
    }

    const newImages = files.map(file => ({
      isExisting: false,
      file,
      previewUrl: URL.createObjectURL(file)
    }));

    setImages(prev => [...prev, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = async (index) => {
    const imgObj = images[index];
    if (imgObj.isExisting) {
      if (!window.confirm("Remove this image permanently?")) return;
      try {
        setLoading(true);
        await supabase.storage.from(STORAGE_BUCKET).remove([imgObj.storage_path]);
        await supabase.from('listing_images').delete().eq('id', imgObj.id);
        showToast({ type: 'success', message: 'Image removed successfully.' });
      } catch (err) {
        console.error(err);
        showToast({ type: 'error', title: 'Failed to remove image', message: getFriendlyErrorMessage(err) });
        setLoading(false);
        return;
      } finally {
        setLoading(false);
      }
    }

    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const compressImage = async (file) => {
    try {
      return await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true, initialQuality: 0.8 });
    } catch (e) {
      console.error(e);
      return file;
    }
  };

  const validateForm = () => {
    const errors = {};
    const summaryList = [];

    const addError = (fieldId, message) => {
        errors[fieldId] = message;
        summaryList.push({ fieldId, message });
    };

    if (!formData.produceName.trim()) addError('produceName', 'Produce name is required.');
    if (!formData.category) addError('category', 'Please select a category.');
    
    const q = parseFloat(formData.quantity);
    const m = parseFloat(formData.minOrder);
    const p = parseFloat(formData.price);
    
    if (isNaN(q) || q <= 0) addError('quantity', 'Quantity must be greater than 0.');
    if (isNaN(m) || m <= 0) addError('minOrder', 'Minimum order must be greater than 0.');
    if (!isNaN(q) && !isNaN(m) && m > q) addError('minOrder', 'Minimum order cannot be greater than the available quantity.');
    if (isNaN(p) || p < 0) addError('price', 'Price cannot be negative.');
    
    if (!formData.availableFrom) addError('availableFrom', 'Please select a start date.');
    if (!formData.availableUntil) addError('availableUntil', 'Please select an end date.');
    
    if (formData.availableFrom && formData.availableUntil) {
        if (new Date(formData.availableUntil) < new Date(formData.availableFrom)) {
            addError('availableUntil', 'End date must be on or after the start date.');
        }
    }

    if (!formData.state) addError('state', 'Please select a state.');
    if (!formData.district) addError('district', 'Please select a district.');
    if (!formData.city.trim()) addError('city', 'City is required.');
    if (!formData.locality.trim()) addError('locality', 'Locality is required.');

    setFieldErrors(errors);
    setFormErrorsList(summaryList);
    
    if (summaryList.length > 0) {
        setFocusTrigger(prev => prev + 1);
        return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
        return;
    }

    setSubmitting(true);
    setBtnText(id ? 'Saving...' : 'Publishing...');

    try {
      const listingData = {
        farmer_id: user.uid,
        produce_name: formData.produceName.trim(),
        category: formData.category,
        quantity: parseFloat(formData.quantity),
        unit: formData.unit,
        minimum_order_quantity: parseFloat(formData.minOrder),
        price_per_unit: parseFloat(formData.price),
        quality: formData.quality,
        availability_start: formData.availableFrom,
        availability_end: formData.availableUntil,
        state: formData.state,
        district: formData.district,
        city: formData.city.trim(),
        locality: formData.locality.trim(),
        description: formData.description.trim(),
      };

      let currentListingId = id;

      if (currentListingId) {
        const { error } = await supabase.from('listings').update(listingData).eq('id', currentListingId);
        if (error) throw error;
      } else {
        listingData.status = 'active';
        const { data, error } = await supabase.from('listings').insert([listingData]).select();
        if (error) throw error;
        currentListingId = data[0].id;
      }

      setBtnText("Uploading images...");
      const newImgs = images.filter(img => !img.isExisting);
      let sortOrder = images.filter(img => img.isExisting).length;
      let failed = 0;

      for (const imgObj of newImgs) {
        const compressedFile = await compressImage(imgObj.file);
        const safeName = (imgObj.file.name || 'image.jpg').replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${Date.now()}-${safeName}`;
        const filePath = `${user.uid}/${currentListingId}/${fileName}`;

        const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, compressedFile);
        if (uploadError) {
          console.error(uploadError);
          failed++;
          continue;
        }

        const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
        await supabase.from('listing_images').insert([{
          listing_id: currentListingId, image_url: publicUrl, storage_path: filePath, sort_order: sortOrder++
        }]);
      }

      if (failed > 0) {
          showToast({ type: 'warning', title: 'Partially saved', message: 'Your listing was saved, but some images failed to upload.' });
      } else {
          showToast({ type: 'success', title: id ? 'Listing updated' : 'Listing published', message: id ? 'Your changes have been saved.' : 'Your produce is now visible to buyers.' });
      }
      
      setTimeout(() => { navigate('/seller'); }, 1500);

    } catch (err) {
      console.error(err);
      showToast({ type: 'error', title: 'Unable to save listing', message: getFriendlyErrorMessage(err) });
    } finally {
      setSubmitting(false);
      setBtnText(id ? 'Save Changes' : 'Publish Listing');
    }
  };

  const getAriaProps = (fieldId) => ({
    'aria-invalid': !!fieldErrors[fieldId],
    'aria-describedby': fieldErrors[fieldId] ? `${fieldId}-error` : undefined
  });

  const renderFieldError = (fieldId) => {
      if (!fieldErrors[fieldId]) return null;
      return <p id={`${fieldId}-error`} className="form-field-error">{fieldErrors[fieldId]}</p>;
  };

  if (loading) {
    return (
      <div className="loading-screen seller-app" id="loading-screen">
          <div className="spinner spinner-green"></div>
          <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="seller-app listing-form-page" id="form-page">
      <header className="seller-page-header">
          <button type="button" className="seller-back-btn" onClick={() => navigate('/seller')} aria-label="Go back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h1 className="seller-page-title">{id ? 'Edit Produce' : 'Add Produce'}</h1>
      </header>

      <div className="listing-form-container">
        
        <FormErrorSummary errors={formErrorsList} focusTrigger={focusTrigger} />

        <form onSubmit={handleSubmit} noValidate className="listing-form">
          <div className="form-section">
            <span className="form-section-title">What are you selling?</span>
            <div className="form-group">
                <label htmlFor="produceName" className="form-label">Produce name</label>
                <input type="text" id="produceName" className="form-input" placeholder="e.g. Fresh Tomatoes" value={formData.produceName} onChange={handleChange} {...getAriaProps('produceName')} />
                {renderFieldError('produceName')}
            </div>
            <div className="form-group">
                <label htmlFor="category" className="form-label">Category</label>
                <select id="category" className="form-select" value={formData.category} onChange={handleChange} {...getAriaProps('category')}>
                    <option value="" disabled>Select category</option>
                    <option value="vegetables">Vegetables</option>
                    <option value="fruits">Fruits</option>
                    <option value="grains">Grains</option>
                    <option value="pulses">Pulses</option>
                    <option value="spices">Spices</option>
                    <option value="dairy">Dairy</option>
                    <option value="other">Other</option>
                </select>
                {renderFieldError('category')}
            </div>
          </div>

          <div className="form-section">
            <span className="form-section-title">Photos <span style={{textTransform:'none', opacity:0.8}}>(max 3)</span></span>
            <div className="photo-upload-zone" onClick={() => fileInputRef.current?.click()} tabIndex="0" role="button" aria-label="Upload photos" onKeyDown={(e) => { if(e.key==='Enter' || e.key===' ') fileInputRef.current?.click(); }}>
                <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" fill="none" strokeWidth="2" style={{color: 'var(--primary)'}}>
                    <path d="M12 5v14M5 12h14" />
                </svg> 
                <p>Tap to select or take photos</p>
                <input type="file" ref={fileInputRef} accept="image/jpeg,image/png,image/webp" multiple style={{display:'none'}} onChange={handleImageChange} tabIndex="-1" />
            </div>
            {images.length > 0 && (
              <div className="photo-preview-grid">
                {images.map((img, index) => (
                  <div key={index} className="photo-preview-item">
                    {index === 0 && <div className="photo-preview-cover-badge">Cover</div>}
                    <img src={img.isExisting ? img.url : img.previewUrl} alt={`preview ${index + 1}`} />
                    <button type="button" className="photo-preview-remove" aria-label="Remove image" onClick={(e) => { e.stopPropagation(); handleRemoveImage(index); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-section">
            <span className="form-section-title">Quantity & Price</span>
            <div className="form-row">
                <div className="form-group">
                    <label htmlFor="quantity" className="form-label">Quantity</label>
                    <input type="number" id="quantity" className="form-input" min="0.01" step="any" placeholder="e.g. 50" value={formData.quantity} onChange={handleChange} {...getAriaProps('quantity')} />
                    {renderFieldError('quantity')}
                </div>
                <div className="form-group">
                    <label htmlFor="unit" className="form-label">Unit</label>
                    <select id="unit" className="form-select" value={formData.unit} onChange={handleChange}>
                        <option value="kg">kg</option>
                        <option value="quintal">Quintal</option>
                        <option value="ton">Ton</option>
                        <option value="litre">Litre</option>
                        <option value="crate">Crate</option>
                        <option value="piece">Piece</option>
                        <option value="dozen">Dozen</option>
                        <option value="bundle">Bundle</option>
                    </select>
                </div>
            </div>
            <div className="form-group">
                <label htmlFor="minOrder" className="form-label">Minimum order</label>
                <input type="number" id="minOrder" className="form-input" min="0.01" step="any" placeholder="e.g. 5" value={formData.minOrder} onChange={handleChange} {...getAriaProps('minOrder')} />
                {renderFieldError('minOrder')}
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label htmlFor="price" className="form-label">Price per unit (₹)</label>
                    <input type="number" id="price" className="form-input" min="0" step="any" placeholder="e.g. 25" value={formData.price} onChange={handleChange} {...getAriaProps('price')} />
                    {renderFieldError('price')}
                </div>
                <div className="form-group">
                    <label htmlFor="quality" className="form-label">Quality</label>
                    <select id="quality" className="form-select" value={formData.quality} onChange={handleChange}>
                        <option value="good">Good</option>
                        <option value="very_good">Very Good</option>
                        <option value="premium">Premium</option>
                    </select>
                </div>
            </div>
          </div>

          <MandiReference 
            produceName={formData.produceName}
            state={formData.state}
            district={formData.district}
            price={formData.price}
            quantity={formData.quantity}
            unit={formData.unit}
          />

          <div className="form-section">
            <span className="form-section-title">Availability</span>
            <div className="form-row">
                <div className="form-group">
                    <label htmlFor="availableFrom" className="form-label">Available from</label>
                    <input type="date" id="availableFrom" className="form-input" value={formData.availableFrom} onChange={handleChange} {...getAriaProps('availableFrom')} />
                    {renderFieldError('availableFrom')}
                </div>
                <div className="form-group">
                    <label htmlFor="availableUntil" className="form-label">Available until</label>
                    <input type="date" id="availableUntil" className="form-input" value={formData.availableUntil} onChange={handleChange} {...getAriaProps('availableUntil')} />
                    {renderFieldError('availableUntil')}
                </div>
            </div>
          </div>

          <div className="form-section">
            <span className="form-section-title">Location</span>
            <div className="form-group">
                <label htmlFor="state" className="form-label">State</label>
                <select id="state" className="form-select" value={formData.state} onChange={handleChange} {...getAriaProps('state')}>
                  <option value="" disabled>Select State</option>
                  {locationTree.map(s => <option key={s.state} value={s.state}>{s.state}</option>)}
                </select>
                {renderFieldError('state')}
            </div>

            <div className="form-group">
                <label htmlFor="district" className="form-label">District</label>
                <select id="district" className="form-select" disabled={districts.length === 0} value={formData.district} onChange={handleChange} {...getAriaProps('district')}>
                  <option value="" disabled>Select District</option>
                  {districts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {renderFieldError('district')}
            </div>

            <div className="form-group">
                <label htmlFor="city" className="form-label">City</label>
                <input type="text" id="city" className="form-input" placeholder="e.g. Guwahati" value={formData.city} onChange={handleChange} {...getAriaProps('city')} />
                {renderFieldError('city')}
            </div>

            <div className="form-group">
                <label htmlFor="locality" className="form-label">Locality / Village</label>
                <input type="text" id="locality" className="form-input" placeholder="e.g. Borbari" value={formData.locality} onChange={handleChange} {...getAriaProps('locality')} />
                {renderFieldError('locality')}
            </div>
          </div>

          <div className="form-section">
            <span className="form-section-title">Additional Info</span>
            <div className="form-group">
                <label htmlFor="description" className="form-label">Description <span style={{textTransform:'none', opacity:0.8}}>(optional)</span></label>
                <textarea id="description" className="form-textarea" rows="3" placeholder="Any extra details about the produce..." value={formData.description} onChange={handleChange} {...getAriaProps('description')}></textarea>
                {renderFieldError('description')}
            </div>
          </div>

          <button type="submit" className="seller-btn seller-btn-primary seller-btn-block" style={{marginTop: '1.5rem'}} disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner" style={{display:'inline-block'}}></span>
                  <span>{btnText}</span>
                </>
              ) : (
                <span>{btnText}</span>
              )}
          </button>
        </form>
      </div>
    </div>
  );
}
