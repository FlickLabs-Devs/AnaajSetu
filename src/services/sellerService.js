import { supabase } from '../lib/supabase';

export const sellerService = {
  // Listings
  async getFarmerListings(farmerId) {
    const { data, error } = await supabase
      .from('listings')
      .select(`
          *,
          listing_images ( id, image_url, storage_path, sort_order )
      `)
      .eq('farmer_id', farmerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async updateListingStatus(listingId, farmerId, newStatus) {
    const { error } = await supabase
      .from('listings')
      .update({ status: newStatus })
      .eq('id', listingId)
      .eq('farmer_id', farmerId);
    if (error) throw error;
  },

  async deleteListing(listingId, farmerId, listingImages = []) {
    // 1. Delete images from storage
    if (listingImages.length > 0) {
      const paths = listingImages.map(i => i.storage_path).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from('listings').remove(paths);
      }
    }
    // 2. Delete listing
    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('id', listingId)
      .eq('farmer_id', farmerId);
    if (error) throw error;
  },

  // Requests count
  async getPendingRequestsCount(farmerId) {
    const { count, error } = await supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('farmer_id', farmerId)
      .eq('status', 'pending');
    if (error) throw error;
    return count || 0;
  },

  // Reputation
  async getReputation(farmerId) {
    const { data, error } = await supabase
      .from('farmer_reputation_view')
      .select('*')
      .eq('farmer_id', farmerId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // Analytics
  async getDashboardAnalytics(farmerId) {
    const [ordersRes, requestsRes, reqListingsRes, negotiationsRes] = await Promise.all([
      supabase.from('orders').select('*').eq('farmer_id', farmerId),
      supabase.from('requests').select('*').eq('farmer_id', farmerId),
      supabase.from('requests').select('*, listings(produce_name)').eq('farmer_id', farmerId),
      supabase.from('negotiations').select('*').eq('farmer_id', farmerId)
    ]);

    const orders = ordersRes.data || [];
    const requests = requestsRes.data || [];
    const reqListings = reqListingsRes.data || [];
    const negotiations = negotiationsRes.data || [];

    const successfulOrders = orders.filter(o => o.status === 'completed' || o.status === 'accepted');
    const totalSales = successfulOrders.reduce((sum, order) => sum + (parseFloat(order.total_amount) || 0), 0);

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

    let mostReqProduce = null;
    let mostReqCount = 0;
    const reqCounts = {};
    reqListings.forEach(req => {
        const produceName = req.listings?.produce_name || 'Produce';
        reqCounts[produceName] = (reqCounts[produceName] || 0) + 1;
        if (reqCounts[produceName] > mostReqCount) {
            mostReqCount = reqCounts[produceName];
            mostReqProduce = produceName;
        }
    });

    return {
      sales: { total: totalSales, count: successfulOrders.length },
      demand: { total: requests.length, pending: requests.filter(r => r.status === 'pending').length, accepted: requests.filter(r => r.status === 'accepted').length },
      mostRequested: { name: mostReqProduce, count: mostReqCount },
      topSelling: { name: topProduce, qty: maxQty, unit: topUnit },
      negotiations: { active: negotiations.filter(n => n.status === 'active' || n.status === 'pending').length, accepted: negotiations.filter(n => n.status === 'accepted').length }
    };
  }
};
