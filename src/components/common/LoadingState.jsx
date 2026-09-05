import React from 'react';

export default function LoadingState({ count = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background: 'var(--surface)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '1rem',
          display: 'flex',
          gap: '1rem',
          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            background: 'var(--surface-alt)',
            borderRadius: '8px'
          }}></div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'center' }}>
            <div style={{ height: '1rem', background: 'var(--surface-alt)', borderRadius: '4px', width: '60%' }}></div>
            <div style={{ height: '0.75rem', background: 'var(--surface-alt)', borderRadius: '4px', width: '40%' }}></div>
            <div style={{ height: '0.75rem', background: 'var(--surface-alt)', borderRadius: '4px', width: '20%' }}></div>
          </div>
        </div>
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
      `}</style>
    </div>
  );
}
