export const supportedCommodities = [
    "Tomato", "Potato", "Rice", "Wheat", "Onion", "Garlic", "Ginger", 
    "Green Chilli", "Cabbage", "Cauliflower", "Carrot", "Brinjal", "Okra", 
    "Cucumber", "Pumpkin", "Bitter Gourd", "Bottle Gourd", "Beans", "Peas", 
    "Maize", "Mustard", "Groundnut", "Soybean", "Banana", "Mango", "Apple", 
    "Orange", "Papaya", "Pineapple", "Turmeric"
];

const basePrices = {
    "Tomato": 2500, "Potato": 1800, "Rice": 3500, "Wheat": 2200, "Onion": 2000, 
    "Garlic": 8000, "Ginger": 6000, "Green Chilli": 4000, "Cabbage": 1500, 
    "Cauliflower": 1800, "Carrot": 2000, "Brinjal": 2500, "Okra": 3000, 
    "Cucumber": 1500, "Pumpkin": 1200, "Bitter Gourd": 3000, "Bottle Gourd": 1200, 
    "Beans": 4000, "Peas": 5000, "Maize": 2000, "Mustard": 5500, 
    "Groundnut": 6000, "Soybean": 4500, "Banana": 3000, "Mango": 5000, 
    "Apple": 8000, "Orange": 4000, "Papaya": 2000, "Pineapple": 3500, "Turmeric": 9000
};

export function normalizeCommodity(value) {
    if (!value) return '';
    let normalized = String(value).toLowerCase().trim().replace(/\s+/g, ' ');
    // Handle some common variations
    if (normalized === 'potatoes') return 'potato';
    if (normalized === 'tomatoes') return 'tomato';
    if (normalized === 'onions') return 'onion';
    if (normalized === 'chilli' || normalized === 'chili' || normalized === 'green chilies' || normalized === 'green chillies') return 'green chilli';
    return normalized;
}

export function normalizeLocation(value) {
    if (!value) return '';
    return String(value).toLowerCase().trim().replace(/\s+/g, ' ');
}

export function getFallbackData(commodity, state, district) {
    const normalizedInput = normalizeCommodity(commodity);
    
    // Find matching commodity
    const matchCommodity = supportedCommodities.find(c => c.toLowerCase() === normalizedInput);
    
    if (!matchCommodity) return null; // No reference available

    const normState = normalizeLocation(state);
    const normDistrict = normalizeLocation(district);

    const hashStr = `${matchCommodity}-${normState}-${normDistrict}`.toLowerCase();
    let hash = 0;
    for (let i = 0; i < hashStr.length; i++) {
        hash = ((hash << 5) - hash) + hashStr.charCodeAt(i);
        hash |= 0;
    }
    
    const randomOffset = Math.abs(hash) % 500; 
    
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
