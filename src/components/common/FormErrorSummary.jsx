import { useRef, useEffect } from 'react';

export default function FormErrorSummary({ errors, focusTrigger }) {
  const summaryRef = useRef(null);
  
  // Focus the error summary when it appears or when explicitly triggered
  useEffect(() => {
    if (errors.length > 0 && summaryRef.current) {
      summaryRef.current.focus();
    }
  }, [focusTrigger, errors.length]);

  if (!errors || errors.length === 0) return null;

  return (
    <div 
      className="form-error-summary" 
      role="alert" 
      aria-labelledby="error-summary-title"
      tabIndex="-1"
      ref={summaryRef}
    >
      <div id="error-summary-title" className="form-error-summary-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Please check the highlighted fields
      </div>
      <ul className="form-error-summary-list">
        {errors.map((error, index) => (
          <li key={index}>
            {error.fieldId ? (
              <a href={`#${error.fieldId}`} onClick={(e) => {
                e.preventDefault();
                const field = document.getElementById(error.fieldId);
                if (field) field.focus();
              }}>
                {error.message}
              </a>
            ) : (
              error.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
