import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { sellerService } from '../../services/sellerService';
import { supabase } from '../../lib/supabase';

export default function SellerBottomNav() {
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    
    const fetchCount = async () => {
      try {
        const count = await sellerService.getPendingRequestsCount(user.uid);
        setPendingCount(count);
      } catch (e) {
        console.error(e);
      }
    };
    fetchCount();

    const channel = supabase.channel('farmer_requests_nav')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'requests', filter: `farmer_id=eq.${user.uid}`
      }, () => {
        fetchCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <nav className="bottom-nav seller-nav" id="seller-bottom-nav" aria-label="Seller navigation">
      <NavLink to="/seller" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} aria-label="Dashboard">
        <span className="nav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        </span>
        <span>Dashboard</span>
      </NavLink>

      <NavLink to="/seller/negotiations" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} aria-label="Offers">
        <span className="nav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <span>Offers</span>
      </NavLink>

      <NavLink to="/seller/listings/new" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} aria-label="Add Listing">
        <span className="nav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </span>
        <span>Add</span>
      </NavLink>

      <NavLink to="/seller/requests" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} aria-label="Requests">
        <span className="nav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          {pendingCount > 0 && (
            <span className="nav-badge">{pendingCount > 9 ? '9+' : pendingCount}</span>
          )}
        </span>
        <span>Requests</span>
      </NavLink>

      <NavLink to="/seller/orders" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} aria-label="Orders">
        <span className="nav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
        </span>
        <span>Orders</span>
      </NavLink>

      <NavLink to="/seller/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} aria-label="Profile">
        <span className="nav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </span>
        <span>Profile</span>
      </NavLink>
    </nav>
  );
}
