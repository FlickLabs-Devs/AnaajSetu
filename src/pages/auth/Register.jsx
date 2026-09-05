import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function Register() {
  const { register, loginWithGoogle, user, profile, loading } = useAuth();
  const navigate = useNavigate();
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (!profile || !profile.role) {
        navigate('/onboarding');
      } else if (profile.role === 'farmer') {
        navigate('/seller');
      } else if (profile.role === 'buyer') {
        navigate('/buyer');
      } else {
        navigate('/onboarding');
      }
    }
  }, [user, profile, loading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!fullName || !email || !password || !confirmPassword || !phoneNumber) {
      setError('Please fill out all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    let finalPhone = null;
    if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
        finalPhone = cleanPhone.substring(2);
    } else if (cleanPhone.length === 10) {
        finalPhone = cleanPhone;
    }

    if (!finalPhone) {
        setError('Please enter a valid 10-digit phone number.');
        return;
    }

    setIsSubmitting(true);
    try {
      await register(email, password, fullName, finalPhone);
      setSuccess('Account created! Redirecting...');
      navigate('/onboarding');
    } catch (err) {
      console.error(err);
      setError('Failed to create account. Email might already be in use.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      await loginWithGoogle();
      setSuccess('Google Login successful! Redirecting...');
    } catch (err) {
      console.error(err);
      setError('Failed to log in with Google.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || (user && profile)) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-green"></div>
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-panel-left" aria-hidden="true">
        <div className="auth-panel-cards">
          <div className="auth-panel-card-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
            For Farmers — list produce
          </div>
          <div className="auth-panel-card-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            For Buyers — discover local
          </div>
          <div className="auth-panel-card-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Hyperlocal &amp; Direct
          </div>
        </div>
        <div className="auth-panel-brand">
          <div className="auth-panel-logo">
            <img src="/assets/images/logo.png" alt="AaharSetu" style={{ filter: 'brightness(0) invert(1)', opacity: 0.9 }} />
          </div>
          <div className="auth-panel-tagline">Join the hyperlocal<br/>food revolution.</div>
          <p className="auth-panel-sub">Whether you grow food or need it — AaharSetu connects you with the community around you. No middlemen involved.</p>
        </div>
      </div>

      <div className="auth-panel-right">
        <div className="auth-card">
          <Link to="/" className="auth-logo-mobile">
            <img src="/assets/images/logo.png" alt="AaharSetu" />
          </Link>

          <div className="auth-header">
            <h1 className="auth-title">Create your account.</h1>
            <p className="auth-subtitle">Get started — it only takes a minute.</p>
          </div>

          {error && <div className="alert alert-error" style={{ display: 'block' }}>{error}</div>}
          {success && <div className="alert alert-success" style={{ display: 'block' }}>{success}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="fullName" className="form-label">Full name</label>
              <input 
                type="text" 
                id="fullName" 
                className="form-control" 
                placeholder="Rahul Sharma" 
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required 
              />
            </div>

            <div className="form-group">
              <label htmlFor="email" className="form-label">Email address</label>
              <input 
                type="email" 
                id="email" 
                className="form-control" 
                placeholder="you@example.com" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                required 
              />
            </div>

            <div className="form-group">
              <label htmlFor="phoneNumber" className="form-label">Phone Number</label>
              <input 
                type="tel" 
                id="phoneNumber" 
                className="form-control" 
                placeholder="10-digit mobile number" 
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                required 
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">Password</label>
              <input 
                type="password" 
                id="password" 
                className="form-control" 
                placeholder="Minimum 6 characters" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                required 
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword" className="form-label">Confirm password</label>
              <input 
                type="password" 
                id="confirmPassword" 
                className="form-control" 
                placeholder="Repeat your password" 
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required 
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block mt-4" disabled={isSubmitting}>
              {isSubmitting ? <span className="spinner" style={{ display: 'inline-block' }}></span> : <span>Create account</span>}
            </button>
          </form>

          <div className="auth-divider">
            <span>OR</span>
          </div>

          <button 
            type="button" 
            className="btn btn-outline btn-block mt-3" 
            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
            onClick={handleGoogleLogin}
            disabled={isSubmitting}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.1 0 5.6 1.1 7.8 2.9l5.8-5.8C34.1 3.2 29.5 1 24 1 14.8 1 6.9 6.9 3 14.8l6.8 5.3C11.5 13 17.2 9.5 24 9.5z"/><path fill="#34A853" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.8H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.2z"/><path fill="#FBBC05" d="M10.1 28.5c-.8-2.4-1.2-5-1.2-7.7s.4-5.3 1.2-7.7l-6.8-5.3C1.2 11.8 0 17.8 0 24s1.2 12.2 3.3 17.2l6.8-5.3z"/><path fill="#EA4335" d="M24 47c6.5 0 12-2.1 16-5.8l-7.5-5.8c-2.2 1.5-5 2.3-8.5 2.3-6.8 0-12.5-4.6-14.6-10.8l-6.8 5.3C6.9 41.1 14.8 47 24 47z"/></svg>
            Continue with Google
          </button>

          <div className="auth-footer">
            Already have an account? <Link to="/login">Log in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
