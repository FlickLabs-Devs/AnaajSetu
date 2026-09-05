/**
 * Translates raw technical error messages or codes into user-friendly language.
 */
export function getFriendlyErrorMessage(error) {
    if (!error) return "We couldn't complete that action right now. Please try again.";
  
    const msg = typeof error === 'string' ? error.toLowerCase() : (error.message || '').toLowerCase();
  
    // Network / Fetch errors
    if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network response was not ok')) {
      return "We're having trouble connecting right now. Please check your internet connection and try again.";
    }
  
    // Authentication / Session
    if (msg.includes('jwt expired') || msg.includes('unauthorized') || msg.includes('auth/')) {
      return "Your session has expired or is invalid. Please sign in again.";
    }
    if (msg.includes('invalid login credentials') || msg.includes('auth/invalid-credential')) {
      return "Incorrect email or password. Please try again.";
    }
    if (msg.includes('auth/email-already-in-use')) {
      return "An account with this email already exists.";
    }
  
    // Database constraints & errors
    if (msg.includes('duplicate key value') || msg.includes('unique constraint')) {
      return "This item already exists or has already been added.";
    }
    if (msg.includes('violates foreign key constraint')) {
      return "This action cannot be completed because a related item does not exist or was removed.";
    }
    if (msg.includes('violates check constraint')) {
      return "Please ensure all filled information is valid.";
    }
    if (msg.includes('invalid input syntax')) {
      return "Please enter a valid format for all fields.";
    }
    if (msg.includes('permission denied') || msg.includes('row-level security')) {
      return "You don't have permission to perform this action.";
    }
    
    // Business logic standard exceptions (from our RPCs)
    if (msg.includes('insufficient stock') || msg.includes('insufficient quantity')) {
      return "The requested quantity is no longer available.";
    }
    if (msg.includes('is not active') || msg.includes('no longer exists')) {
      return "This produce is no longer available.";
    }
    if (msg.includes('cart not found') || msg.includes('cart is empty')) {
      return "Your cart is empty or could not be found.";
    }
    if (msg.includes('below minimum order')) {
      return "The quantity is below the required minimum order.";
    }
  
    // If it's already a clean message from our frontend validation, return it (we assume clean messages don't have technical jargon)
    if (msg.length > 0 && !msg.includes('rpc') && !msg.includes('postgresql') && !msg.includes('supabase') && !msg.includes('json') && !msg.includes('500') && !msg.includes('400')) {
       // Just return the original if it looks clean (capitalized properly from original)
       return typeof error === 'string' ? error : error.message;
    }
  
    return "Something went wrong while processing your request. Please try again.";
}
