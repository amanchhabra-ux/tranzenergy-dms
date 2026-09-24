import React from 'react';
import { ClerkProvider, SignIn, useAuth, useUser } from '@clerk/clerk-react';

// Sign-in with Clerk (Google, Microsoft, email code). Switched on by setting
// VITE_CLERK_PUBLISHABLE_KEY in Vercel; without it the old email login is used.
export const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
export const clerkEnabled = !!CLERK_KEY;

const appearance = {
  variables: {
    colorPrimary: '#ea580c',
    colorText: '#18181b',
    colorTextSecondary: '#52525b',
    colorBackground: '#ffffff',
    borderRadius: '10px',
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  elements: {
    card: { boxShadow: 'none', border: 'none', padding: '8px 0 0' },
    rootBox: { width: '100%' },
    cardBox: { width: '100%', boxShadow: 'none', border: 'none' },
    headerTitle: { display: 'none' },
    headerSubtitle: { display: 'none' },
    footer: { background: 'transparent' },
  },
};

export function Splash({ text = 'Loading…' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f5f5f4', color: '#18181b', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 44, height: 44, border: '4px solid #e7e5e4', borderTopColor: '#ea580c', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 18 }} />
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      <div style={{ fontSize: 16, fontWeight: 600 }}>TRANZENERGY DMS</div>
      <div style={{ fontSize: 12, color: '#71717a', marginTop: 6 }}>{text}</div>
    </div>
  );
}

function SignInPage() {
  return (
    <div className="login-page-modern">
      <div className="login-animated-bg" />
      <div className="login-glass-card" style={{ padding: '40px 36px 28px' }}>
        <div className="login-brand-modern login-brand-logo" style={{ marginBottom: 20 }}>
          <img src="/logo.png" alt="Tranz Energy" />
          <div className="login-brand-sub-modern">Enterprise Document Control</div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-muted)', margin: '0 0 8px' }}>
          Sign in with Google, Microsoft or your work email
        </p>
        <SignIn routing="hash" appearance={appearance} />
      </div>
    </div>
  );
}

function Gate({ children }) {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  if (!isLoaded) return <Splash text="Checking sign-in…" />;
  if (!isSignedIn || !user) return <SignInPage />;
  const email = String(user.primaryEmailAddress?.emailAddress || '').toLowerCase();
  return children({ email, name: user.fullName || email, signOut: () => signOut() });
}

/** Wraps the app: shows the sign-in page until someone is signed in. */
export function AuthGate({ children }) {
  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/" appearance={appearance}>
      <Gate>{children}</Gate>
    </ClerkProvider>
  );
}
