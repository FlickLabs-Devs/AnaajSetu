const https = require('https');

// Fallbacks for environment variables in case they are not set in the Netlify dashboard for the prototype
const FIREBASE_API_KEY_FALLBACK = "AIzaSyB6MtJa7JApePvOuF31rwkfLnfeaoER4J4";
const SUPABASE_URL_FALLBACK = "https://gbjjzqzkkmuxrizxnuta.supabase.co";

/**
 * Helper to make HTTPS requests without external dependencies
 */
function request(url, options, postData) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ statusCode: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);

        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const body = JSON.parse(event.body);
        const { idToken, order_id, rating, review_text } = body;

        if (!idToken || !order_id || !rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid input parameters.' }) };
        }

        // 1. Verify Firebase JWT via Identity Toolkit REST API
        const firebaseApiKey = process.env.FIREBASE_API_KEY || FIREBASE_API_KEY_FALLBACK;
        const identityUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`;
        
        const identityResponse = await request(identityUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, JSON.stringify({ idToken }));

        if (identityResponse.statusCode !== 200 || !identityResponse.data.users || !identityResponse.data.users.length) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid Firebase token.' }) };
        }

        const buyer_id = identityResponse.data.users[0].localId;

        // 2. Setup Supabase Client config
        const supabaseUrl = process.env.SUPABASE_URL || SUPABASE_URL_FALLBACK;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!serviceRoleKey) {
            console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
            return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error.' }) };
        }

        const headers = {
            'Content-Type': 'application/json',
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`
        };

        // 3. Fetch the order to verify ownership and status
        const orderUrl = `${supabaseUrl}/rest/v1/orders?id=eq.${order_id}&select=buyer_id,farmer_id,status`;
        const orderRes = await request(orderUrl, { method: 'GET', headers });

        if (orderRes.statusCode !== 200 || !orderRes.data || !orderRes.data.length) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Order not found.' }) };
        }

        const order = orderRes.data[0];

        if (order.buyer_id !== buyer_id) {
            return { statusCode: 403, body: JSON.stringify({ error: 'You can only review orders you purchased.' }) };
        }

        if (order.status !== 'completed') {
            return { statusCode: 400, body: JSON.stringify({ error: 'Feedback is available after the order is completed.' }) };
        }

        // 4. Upsert the review using Supabase REST API (on_conflict=order_id)
        const upsertUrl = `${supabaseUrl}/rest/v1/farmer_reviews?on_conflict=order_id`;
        
        const reviewPayload = {
            order_id: order_id,
            buyer_id: buyer_id,
            farmer_id: order.farmer_id,
            rating: rating,
            review_text: review_text || null
        };

        const headersUpsert = {
            ...headers,
            'Prefer': 'resolution=merge-duplicates,return=representation'
        };

        const upsertRes = await request(upsertUrl, {
            method: 'POST',
            headers: headersUpsert
        }, JSON.stringify(reviewPayload));

        if (upsertRes.statusCode >= 400) {
            console.error("Supabase upsert error:", upsertRes.data);
            return { 
                statusCode: upsertRes.statusCode, 
                body: JSON.stringify({ error: 'Unable to submit your review. Please try again.' }) 
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, review: upsertRes.data[0] })
        };

    } catch (err) {
        console.error('Error in submit-review:', err);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error.' }) };
    }
};
