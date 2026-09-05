import React from 'react';

export default function StatusBadge({ status }) {
  const getStyle = (s) => {
    switch (s?.toLowerCase()) {
      case 'accepted':
      case 'completed':
        return { bg: 'var(--success-bg)', text: 'var(--success)' };
      case 'pending':
        return { bg: '#fffbeb', text: '#d97706' }; // amber
      case 'rejected':
      case 'cancelled':
        return { bg: 'var(--error-bg)', text: 'var(--error)' };
      case 'active':
        return { bg: '#eff6ff', text: '#2563eb' }; // blue
      default:
        return { bg: 'var(--surface-alt)', text: 'var(--text-muted)' };
    }
  };

  const style = getStyle(status);

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0.25rem 0.75rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.025em',
      backgroundColor: style.bg,
      color: style.text
    }}>
      {status}
    </span>
  );
}
