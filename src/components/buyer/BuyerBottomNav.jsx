import { NavLink } from 'react-router-dom';

export default function BuyerBottomNav() {
  return (
    <nav className="bottom-nav buyer-nav" id="buyer-bottom-nav" aria-label="Buyer navigation">
        <NavLink
          to="/buyer"
          end
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          aria-label="Home"
        >
            <span className="nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
            </span>
            <span>Home</span>
        </NavLink>

        <NavLink
          to="/buyer/negotiations"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          aria-label="Negotiations"
        >
            <span className="nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
            </span>
            <span>Offers</span>
        </NavLink>

        <NavLink
          to="/buyer/requests"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          aria-label="Requests"
        >
            <span className="nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
            </span>
            <span>Requests</span>
        </NavLink>

        <NavLink
          to="/buyer/orders"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          aria-label="Orders"
        >
            <span className="nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
            </span>
            <span>Orders</span>
        </NavLink>

        <NavLink
          to="/buyer/profile"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          aria-label="Profile"
        >
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