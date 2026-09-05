import { useState, useEffect } from 'react';

const mandiCache = new Map();

function parseDate(dateStr) {
    if (!dateStr) return 0;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
    }
    return 0;
}

function getBestMarketRecord(records, district) {
    if (!records || records.length === 0) return null;
    let localRecords = records.filter(r => r.district.toLowerCase() === district.toLowerCase());
    if (localRecords.length === 0) {
        localRecords = records;
    }
    localRecords.sort((a, b) => parseDate(b.arrivalDate) - parseDate(a.arrivalDate));
    return localRecords[0];
}

function getQuantityInKg(quantity, unit) {
    switch (unit) {
        case 'kg': return quantity;
        case 'quintal': return quantity * 100;
        case 'ton': return quantity * 1000;
        default: return null;
    }
}

export default function MandiReference({ produceName, state, district, price, quantity, unit }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchMandi = async () => {
      const hasAllData = produceName && state && district && !state.includes('Select') && !district.includes('Select');
      if (!hasAllData) {
        setData(null);
        setError(false);
        return;
      }

      const cacheKey = `${produceName}|${state}|${district}`.toLowerCase();
      if (mandiCache.has(cacheKey)) {
        setData(mandiCache.get(cacheKey));
        return;
      }

      setLoading(true);
      setError(false);

      try {
        const url = `/.netlify/functions/mandi-prices?commodity=${encodeURIComponent(produceName)}&state=${encodeURIComponent(state)}&district=${encodeURIComponent(district)}`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error('Network response was not ok');
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error || 'Unknown error');

        const bestRecord = getBestMarketRecord(result.records || [], district);
        const newData = { record: bestRecord, matchLevel: result.matchLevel, reason: result.reason, source: result.source };
        mandiCache.set(cacheKey, newData);
        setData(newData);
      } catch (err) {
        console.error("Error fetching mandi prices:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchMandi, 500);
    return () => clearTimeout(debounce);
  }, [produceName, state, district]);

  if (error) {
    return (
      <div className="form-section mandi-reference error mandi-empty" style={{background: 'var(--surface-alt)'}}>
        <p className="text-sm" style={{color: 'var(--error)'}}>Unable to check mandi prices right now. You can still publish your listing.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="form-section mandi-reference mandi-loading" style={{background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
        <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', display: 'inline-block' }}></span> 
        <span className="text-sm">Checking local mandi prices...</span>
      </div>
    );
  }

  const hasAllData = produceName && state && district && !state.includes('Select') && !district.includes('Select');

  if (!hasAllData) {
    const isPartial = produceName || (state && !state.includes('Select'));
    return (
      <div className="form-section mandi-reference mandi-advisory" style={{background: 'var(--surface-alt)'}}>
        <div className="mandi-reference-header" style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
          <span className="mandi-icon">🏷️</span>
          <span className="form-section-title" style={{margin: 0}}>Local Mandi Price</span>
        </div>
        <p className="mandi-reference-subtitle" style={{marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)'}}>
          {isPartial ? 'Complete produce, state and district to check local mandi prices.' : 'Fill in your produce, state and district to see the latest nearby government mandi price range.'}
        </p>
      </div>
    );
  }

  if (!data || !data.record) {
    const { reason } = data || {};
    const noData = reason === "NO_DATA_AVAILABLE" || reason === "NO_MATCHING_RECORDS";
    return (
      <div className="form-section mandi-reference mandi-empty" style={{background: 'var(--surface-alt)'}}>
        <span className="form-section-title">Local Mandi Price</span>
        <p style={{fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0}}>{noData ? 'No recent mandi data found for this exact location and produce.' : 'Local mandi data isn\'t available for this produce and location yet.'}</p>
      </div>
    );
  }

  const { record, matchLevel, source } = data;
  const minPriceKg = record.minPricePerQuintal / 100;
  const maxPriceKg = record.maxPricePerQuintal / 100;
  const modalPriceKg = record.modalPricePerQuintal / 100;

  let priceComparisonHtml = null;
  const pPrice = parseFloat(price);
  if (pPrice > 0 && ['kg', 'quintal', 'ton'].includes(unit)) {
      let farmerPricePerKg = pPrice;
      if (unit === 'quintal') farmerPricePerKg = pPrice / 100;
      if (unit === 'ton') farmerPricePerKg = pPrice / 1000;

      if (farmerPricePerKg < minPriceKg) {
          priceComparisonHtml = <p className="mandi-status below text-warning text-sm mt-2">Your price is below the local mandi range.</p>;
      } else if (farmerPricePerKg > maxPriceKg) {
          priceComparisonHtml = <p className="mandi-status above text-primary text-sm mt-2">Your price is above the local mandi range.</p>;
      } else {
          priceComparisonHtml = <p className="mandi-status within text-success text-sm mt-2">Your price is within the local mandi range.</p>;
      }
  }

  let estimatedValueHtml = null;
  const quantityInKg = getQuantityInKg(parseFloat(quantity), unit);
  
  if (quantityInKg !== null) {
      if (quantityInKg > 0) {
          const estMin = Math.round(quantityInKg * minPriceKg);
          const estMax = Math.round(quantityInKg * maxPriceKg);
          const estModal = Math.round(quantityInKg * modalPriceKg);
          
          estimatedValueHtml = (
              <div className="mandi-est-value mt-3 pt-2 border-t dashed">
                  <p className="text-xs text-faint">For {quantity} {unit}</p>
                  <p className="text-sm mt-1">Mandi range: <strong>&#8377;{estMin.toLocaleString()} - &#8377;{estMax.toLocaleString()}</strong></p>
                  <p className="text-sm">Typical mandi value: <strong>&#8377;{estModal.toLocaleString()}</strong></p>
              </div>
          );
      }
  } else {
      estimatedValueHtml = (
          <div className="mandi-est-value mt-3 pt-2 border-t dashed">
              <p className="text-xs text-faint">Mandi reference is reported per kg. Unit conversion is not available for this unit.</p>
          </div>
      );
  }

  let titleText = 'Local Mandi Price';
  let fallbackMessageHtml = null;

  if (source === 'fallback') {
      titleText = 'Indicative mandi reference';
      fallbackMessageHtml = <p className="mandi-status fallback text-info text-sm mt-2">Recent mandi data.</p>;
  } else {
      titleText = 'Government mandi reference';
      if (matchLevel && matchLevel !== 'exact' && matchLevel !== 'district_commodity' && matchLevel !== 'district') {
          fallbackMessageHtml = <p className="mandi-status fallback text-info text-sm mt-2">Showing the latest available mandi reference for your area/state.</p>;
      } else if (matchLevel === 'district') {
          fallbackMessageHtml = <p className="mandi-status fallback text-info text-sm mt-2">Showing the latest available mandi reference for your area/state.</p>;
      }
  }

  return (
    <div className="form-section mandi-reference" style={{background: 'var(--seller-primary-softer)', borderColor: 'var(--seller-primary-soft)'}}>
      <div className="mandi-reference-header" style={{display: 'flex', flexDirection: 'column'}}>
          <span className="form-section-title" style={{margin: 0}}>● {titleText}</span>
          <span style={{fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.25rem'}}>{record.district} / {record.market || 'Unknown Market'}</span>
      </div>
      
      <div className="mandi-body" style={{marginTop: '1rem'}}>
          <div className="mandi-price-range">
              <span style={{fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)'}}>₹{minPriceKg} - ₹{maxPriceKg} <span style={{fontSize: '0.875rem', fontWeight: 'normal', color: 'var(--text-muted)'}}>/ kg</span></span>
          </div>
          <div className="mandi-price-modal" style={{fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem'}}>
              Typical: ₹{modalPriceKg} / kg
          </div>
          
          {estimatedValueHtml}
          {priceComparisonHtml}
          {fallbackMessageHtml}

          <p style={{fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border)'}}>Based on latest available mandi data ({record.arrivalDate || 'Recent'})</p>
      </div>
    </div>
  );
}
