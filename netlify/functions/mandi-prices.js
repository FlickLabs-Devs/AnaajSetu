import https from 'https';

function fetchGovData(url, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    let parsedData = null;
                    if (data && data.trim().length > 0) {
                        parsedData = JSON.parse(data);
                    } else {
                        throw new Error("Empty response from upstream");
                    }
                    resolve({ statusCode: res.statusCode, data: parsedData });
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${e.message}`));
                }
            });
        });
        
        req.on('error', (e) => {
            reject(e);
        });

        // Abort the request if it hangs too long
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error(`Mandi upstream API timed out after ${timeoutMs}ms`));
        });
    });
}

function normalizeCommodity(value) {
    if (!value) return '';
    let normalized = String(value).toLowerCase().trim().replace(/\s+/g, ' ');
    if (normalized === 'potatoes') return 'potato';
    if (normalized === 'tomatoes') return 'tomato';
    if (normalized === 'onions') return 'onion';
    if (normalized === 'chilli' || normalized === 'chili' || normalized === 'green chilies' || normalized === 'green chillies') return 'green chilli';
    return normalized;
}

function normalizeLocation(value) {
    if (!value) return '';
    return String(value).toLowerCase().trim().replace(/\s+/g, ' ');
}

function getFallbackData(commodity, state, district) {
    const supportedCommodities = [
        "Tomato", "Potato", "Rice", "Wheat", "Onion", "Garlic", "Ginger", 
        "Green Chilli", "Cabbage", "Cauliflower", "Carrot", "Brinjal", "Okra", 
        "Cucumber", "Pumpkin", "Bitter Gourd", "Bottle Gourd", "Beans", "Peas", 
        "Maize", "Mustard", "Groundnut", "Soybean", "Banana", "Mango", "Apple", 
        "Orange", "Papaya", "Pineapple", "Turmeric"
    ];

    const normalizedInput = normalizeCommodity(commodity);
    const matchCommodity = supportedCommodities.find(c => c.toLowerCase() === normalizedInput);
    
    if (!matchCommodity) return null;

    const normState = normalizeLocation(state);
    const normDistrict = normalizeLocation(district);

    const hashStr = `${matchCommodity}-${normState}-${normDistrict}`.toLowerCase();
    let hash = 0;
    for (let i = 0; i < hashStr.length; i++) {
        hash = ((hash << 5) - hash) + hashStr.charCodeAt(i);
        hash |= 0;
    }
    
    const randomOffset = Math.abs(hash) % 500; 
    
    const basePrices = {
        "Tomato": 2500, "Potato": 1800, "Rice": 3500, "Wheat": 2200, "Onion": 2000, 
        "Garlic": 8000, "Ginger": 6000, "Green Chilli": 4000, "Cabbage": 1500, 
        "Cauliflower": 1800, "Carrot": 2000, "Brinjal": 2500, "Okra": 3000, 
        "Cucumber": 1500, "Pumpkin": 1200, "Bitter Gourd": 3000, "Bottle Gourd": 1200, 
        "Beans": 4000, "Peas": 5000, "Maize": 2000, "Mustard": 5500, 
        "Groundnut": 6000, "Soybean": 4500, "Banana": 3000, "Mango": 5000, 
        "Apple": 8000, "Orange": 4000, "Papaya": 2000, "Pineapple": 3500, "Turmeric": 9000
    };

    const base = basePrices[matchCommodity] + randomOffset;
    const minPrice = base - 200;
    const maxPrice = base + 300;
    const modalPrice = base;
    
    const today = new Date();
    const arrivalDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    let matchLevel = 'exact';
    if (!state && !district) matchLevel = 'commodity';
    else if (!district) matchLevel = 'state';
    else if (!state) matchLevel = 'district';
    else matchLevel = 'exact';

    return {
        record: {
            state: state || 'Unknown State',
            district: district || 'Unknown District',
            market: 'Demo Reference Market',
            commodity: matchCommodity,
            variety: 'FAQ',
            grade: 'FAQ',
            arrivalDate: arrivalDate,
            minPricePerQuintal: minPrice,
            maxPricePerQuintal: maxPrice,
            modalPricePerQuintal: modalPrice
        },
        matchLevel: matchLevel
    };
}

export default async (req, context) => {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ success: false, error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const normalizeStr = (str) => (str || '').replace(/\s+/g, ' ').trim();

    const url = new URL(req.url);
    const commodity = normalizeStr(url.searchParams.get("commodity"));
    const state = normalizeStr(url.searchParams.get("state"));
    const district = normalizeStr(url.searchParams.get("district"));

    if (!commodity || !state || !district) {
        return new Response(JSON.stringify({
            success: false,
            error: 'Commodity, state and district are required.'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const apiKey = process.env.DATA_GOV_API_KEY;
    if (!apiKey) {
        console.error("DATA_GOV_API_KEY is not set.");
        // We will continue to fallback instead of returning 500 immediately
    }

    const baseUrl = 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070';
    
    console.log(`[Mandi] Government API request: state=${state} district=${district} commodity=${commodity}`);

    const fallbacks = [
        { matchLevel: 'exact', params: { 'filters[state]': state, 'filters[district]': district, 'filters[commodity]': commodity } },
        { matchLevel: 'district', params: { 'filters[state]': state, 'filters[district]': district } },
        { matchLevel: 'state', params: { 'filters[state]': state, 'filters[commodity]': commodity } },
        { matchLevel: 'commodity', params: { 'filters[state]': state } }
    ];

    let hasGovData = false;

    if (apiKey) {
        for (const fallback of fallbacks) {
            const queryParams = new URLSearchParams({
                'api-key': apiKey,
                'format': 'json',
                ...fallback.params
            });
            
            const url = `${baseUrl}?${queryParams.toString()}`;
            
            try {
                const response = await fetchGovData(url);
                const parsedData = response.data;
                const httpStatus = response.statusCode;
                
                console.log(`[Mandi] Government API status: ${httpStatus} (matchLevel: ${fallback.matchLevel})`);
                
                if (parsedData.status === "error") {
                    console.error("data.gov.in API error:", parsedData.message);
                    break; // break loop and try fallback
                }
                
                const records = parsedData.records || [];
                console.log(`[Mandi] Government records returned: ${records.length}`);
                
                if (records.length > 0) {
                    hasGovData = true;
                    console.log(`[Mandi] Using Government data`);
                    
                    const normalizedRecords = records.map(record => {
                        return {
                            state: record.state,
                            district: record.district,
                            market: record.market,
                            commodity: record.commodity,
                            variety: record.variety,
                            grade: record.grade,
                            arrivalDate: record.arrival_date,
                            minPricePerQuintal: parseFloat(record.min_price) || 0,
                            maxPricePerQuintal: parseFloat(record.max_price) || 0,
                            modalPricePerQuintal: parseFloat(record.modal_price) || 0
                        };
                    });
                    
                    return new Response(JSON.stringify({
                        success: true,
                        source: "government",
                        resourceId: "9ef84268-d588-465a-a308-a864a43d0070",
                        records: normalizedRecords,
                        matchLevel: fallback.matchLevel
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            } catch (e) {
                console.error("Error fetching/parsing data.gov.in response:", e);
                console.warn("[Mandi] Live API unavailable, proceeding to local fallback");
                break; // break loop and try fallback for any errors
            }
        }
    }

    if (!hasGovData) {
        console.log(`[Mandi] Government data unavailable`);
        const fallbackData = getFallbackData(commodity, state, district);
        
        if (fallbackData) {
            console.log(`[Mandi] Using fallback reference`);
            return new Response(JSON.stringify({
                success: true,
                source: "fallback",
                records: [fallbackData.record],
                matchLevel: fallbackData.matchLevel
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    // Exhausted all options
    return new Response(JSON.stringify({
        success: false,
        source: null,
        records: [],
        reason: "NO_DATA_AVAILABLE"
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};
