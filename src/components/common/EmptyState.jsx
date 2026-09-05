import React from 'react';
import { PackageOpen } from 'lucide-react';

export default function EmptyState({ icon: Icon = PackageOpen, title, description, action, actionText }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4rem 2rem',
      textAlign: 'center',
      background: 'var(--surface)',
      borderRadius: '16px',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: 'var(--primary-light)',
        color: 'var(--primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '1.5rem'
      }}>
        <Icon size={32} />
      </div>
      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: 'var(--text)' }}>
        {title}
      </h3>
      {description && (
        <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-muted)', maxWidth: '400px' }}>
          {description}
        </p>
      )}
      {action && actionText && (
        <button 
          onClick={action}
          className="btn btn-primary"
          style={{ borderRadius: '24px', padding: '0.75rem 1.5rem', fontWeight: 600 }}
        >
          {actionText}
        </button>
      )}
    </div>
  );
}
