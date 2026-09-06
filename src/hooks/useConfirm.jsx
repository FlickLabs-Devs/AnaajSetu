import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [confirmState, setConfirmState] = useState(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setConfirmState({
        ...options,
        resolve,
      });
    });
  }, []);

  const handleClose = useCallback(() => {
    if (confirmState) {
      confirmState.resolve(false);
      setConfirmState(null);
    }
  }, [confirmState]);

  const handleConfirm = useCallback(() => {
    if (confirmState) {
      confirmState.resolve(true);
      setConfirmState(null);
    }
  }, [confirmState]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmText={confirmState.confirmText || 'Confirm'}
          cancelText={confirmState.cancelText || 'Cancel'}
          onConfirm={handleConfirm}
          onCancel={handleClose}
          isDanger={confirmState.isDanger}
          action={confirmState.action}
          loadingText={confirmState.loadingText}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}

function ConfirmDialog({ title, message, confirmText, cancelText, onConfirm, onCancel, isDanger, action, loadingText }) {
  const dialogRef = useRef(null);
  const cancelBtnRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirmClick = async () => {
    if (action) {
      setIsSubmitting(true);
      try {
        await action();
        onConfirm();
      } catch (error) {
        setIsSubmitting(false);
        // Error handling occurs in the action
      }
    } else {
      onConfirm();
    }
  };

  useEffect(() => {
    // Trap focus inside dialog
    const handleKeyDown = (e) => {
      if (isSubmitting) return; // Disable keyboard navigation while submitting
      if (e.key === 'Escape') {
        onCancel();
      }
      
      if (e.key === 'Tab') {
        const focusableElements = dialogRef.current.querySelectorAll('button');
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    // Focus cancel button by default to prevent accidental destructive actions
    if (cancelBtnRef.current) {
        cancelBtnRef.current.focus();
    }
    
    // Prevent background scrolling
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onCancel]);

  return (
    <div className="confirm-dialog-overlay">
      <div 
        className="confirm-dialog-content" 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        ref={dialogRef}
      >
        <h2 id="confirm-dialog-title" className="confirm-dialog-title">{title}</h2>
        {message && <p id="confirm-dialog-message" className="confirm-dialog-message">{message}</p>}
        <div className="confirm-dialog-actions">
          <button 
            ref={cancelBtnRef}
            className="btn btn-secondary" 
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {cancelText}
          </button>
          <button 
            className={`btn ${isDanger ? 'btn-danger' : 'btn-buyer-primary'}`} 
            onClick={handleConfirmClick}
            disabled={isSubmitting}
          >
            {isSubmitting ? (loadingText || 'Processing...') : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
