import { supabase } from '../lib/supabase';

export const buyerService = {
  // Analytics
  async getDashboardAnalytics(buyerId) {
    const [ordersRes, requestsRes, negotiationsRes] = await Promise.all([
      supabase.from('orders').select('*').eq('buyer_id', buyerId),
      supabase.from('requests').select('*').eq('buyer_id', buyerId),
      supabase.from('negotiations').select('*').eq('buyer_id', buyerId)
    ]);

    const orders = ordersRes.data || [];
    const requests = requestsRes.data || [];
    const negotiations = negotiationsRes.data || [];

    // Order metrics
    const successfulOrders = orders.filter(o => o.status === 'completed' || o.status === 'accepted');
    const totalSpend = successfulOrders.reduce((sum, order) => sum + (parseFloat(order.total_amount) || 0), 0);
    const activeOrders = orders.filter(o => o.status === 'accepted').length;
    
    // Request metrics
    const pendingRequests = requests.filter(r => r.status === 'pending').length;
    const acceptedRequests = requests.filter(r => r.status === 'accepted').length;

    // Negotiation metrics
    const activeNegotiations = negotiations.filter(n => n.status === 'active' || n.status === 'pending').length;
    
    // Calculate top purchased produce
    let topProduce = null;
    let maxQty = 0;
    let topUnit = '';
    const grouped = {};
    successfulOrders.forEach(o => {
        const name = o.produce_name || 'Produce';
        const unit = (o.unit || 'kg').toLowerCase();
        const key = `${name}|${unit}`;
        grouped[key] = (grouped[key] || 0) + (parseFloat(o.quantity) || 0);
        if (grouped[key] > maxQty) {
            maxQty = grouped[key];
            topProduce = name;
            topUnit = unit;
        }
    });

    return {
      spending: { total: totalSpend, count: successfulOrders.length, activeOrders: activeOrders },
      requests: { total: requests.length, pending: pendingRequests, accepted: acceptedRequests },
      topPurchase: { name: topProduce, qty: maxQty, unit: topUnit },
      negotiations: { active: activeNegotiations }
    };
  }
};
