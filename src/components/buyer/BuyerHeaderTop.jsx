import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../hooks/useCart';

export default function BuyerHeaderTop() {
    const { itemCount } = useCart();
    
    return (
        <div className="dash-header-top">
            <Link to="/buyer" className="dash-brand" aria-label="AnaajSetu Home">
                <img src="/assets/images/logo.png" alt="AnaajSetu" />
            </Link>
            <Link to="/buyer/cart" className="dash-profile-btn buyer-cart-btn" aria-label="Shopping Cart">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:'20px', height:'20px'}}>
                    <circle cx="9" cy="21" r="1"></circle>
                    <circle cx="20" cy="21" r="1"></circle>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
                {itemCount > 0 && <span className="buyer-cart-badge">{itemCount}</span>}
            </Link>
        </div>
    );
}
