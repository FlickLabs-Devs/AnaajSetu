import React from 'react';
import BuyerBottomNav from './BuyerBottomNav';

export default function BuyerLayout({ children, title, subtitle, headerAction }) {
  return (
    <div className="buyer-layout">
      {/* Header */}
      <header className="buyer-header">
        <div className="buyer-header-content">
          <div>
            <h1 className="buyer-header-title">{title}</h1>
            {subtitle && <p className="buyer-header-subtitle">{subtitle}</p>}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="buyer-main-content">
        {children}
      </main>

      {/* Navigation */}
      <BuyerBottomNav />
    </div>
  );
}
