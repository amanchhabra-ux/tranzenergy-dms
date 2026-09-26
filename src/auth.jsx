import React from 'react';
import { ClerkProvider, SignIn, useAuth, useUser } from '@clerk/clerk-react';
import { usePublicOrg } from './utils/useOrg';

// Sign-in with Clerk (Google, Microsoft, email code). Switched on by setting
// VITE_CLERK_PUBLISHABLE_KEY in Vercel; without it the old email login is used.
export const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
export const clerkEnabled = !!CLERK_KEY;

const appearanceFor = (org) => ({
  variables: {
    colorPrimary: /^#[0-9a-f]{6}$/i.test(org?.primaryColor || '') ? org.primaryColor : '#3b5b7e',
    colorText: '#1f2d27',
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
});

export function Splash({ text = 'Loading…' }) {
  const org = usePublicOrg();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f4f7f2', color: '#1f2d27', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 44, height: 44, border: '4px solid #e3eadf', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 18 }} />
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{org.name}</div>
      <div style={{ fontSize: 12, color: '#71717a', marginTop: 6 }}>{text}</div>
    </div>
  );
}

function SignInPage() {
  const org = usePublicOrg();
  return (
    <div className="login-page-modern">
      <div className="login-animated-bg" />
      <div className="login-glass-card" style={{ padding: '40px 36px 28px' }}>
        <div className="login-brand-modern login-brand-logo" style={{ marginBottom: 20 }}>
          {org.logoUrl ? <img src={org.logoUrl} alt={org.name} /> : <div className="login-brand-name-modern">{org.name}</div>}
          <div className="login-brand-sub-modern">Enterprise Document Control</div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-muted)', margin: '0 0 8px' }}>
          Sign in with Google, Microsoft or your work email
        </p>
        <SignIn routing="hash" appearance={appearanceFor(org)} />
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
  const org = usePublicOrg();
  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/" appearance={appearanceFor(org)}>
      <Gate>{children}</Gate>
    </ClerkProvider>
  );
}
