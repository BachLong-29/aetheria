'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

import { clientEnv } from '@/configs/env';

import { useGoogleLogin } from '../hooks/useGoogleLogin';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            error_callback?: (error: { type: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  /** Called when the credential exchange fails — lets the parent surface an alert. */
  onError?: () => void;
}

/**
 * Keeps the app's original multi-color "G" stone button visually, while the
 * real Google Identity Services button is rendered invisibly on top of it —
 * Google's iframe is what actually receives the click (their branding rules
 * forbid recoloring the real button), so the credential flow still works.
 * Hidden entirely when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` isn't configured.
 */
export function GoogleSignInButton({ onError }: GoogleSignInButtonProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  // Whether Google's real iframe button ever got rendered into the overlay —
  // if not, the visible stone underneath is just decoration with nothing to click.
  // A ref (not state) because it's only read inside the click handler, never rendered.
  const buttonReady = useRef(false);
  const googleLogin = useGoogleLogin();
  const clientId = clientEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!scriptReady || !clientId || !overlayRef.current || !window.google) return;
    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          googleLogin.mutate(response.credential, {
            onError: (err) => {
              console.error('Google login failed:', err);
              onError?.();
            },
          });
        },
        error_callback: (error) => {
          console.error('Google Identity Services error:', error);
          onError?.();
        },
      });
      // A wide standard button, scaled up in the overlay below, so Google's iframe
      // covers the whole stone — the icon variant is only 40px and left the rest dead.
      window.google.accounts.id.renderButton(overlayRef.current.firstElementChild as HTMLElement, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width: 400,
      });
      buttonReady.current = true;
    } catch (err) {
      // Most commonly: this origin isn't in the client ID's "Authorized JavaScript
      // origins" list — GIS throws synchronously instead of calling error_callback.
      console.error('Google Identity Services failed to initialize:', err);
    }
    // googleLogin is a fresh useMutation object every render — only re-init on script load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady, clientId]);

  if (!clientId) return null;

  return (
    <div
      className="auth-stone stone-gold relative"
      aria-label="Continue with Google"
      onClick={() => {
        // The real click target is Google's invisible iframe overlay. If it never
        // rendered (script blocked by an ad-blocker/extension, network failure, or
        // this origin not authorized for the client ID), that overlay is empty and
        // clicks on the visible stone would otherwise do nothing at all.
        if (!buttonReady.current) {
          console.error(
            "Google sign-in button never became interactive — the accounts.google.com script may be blocked (ad-blocker/privacy extension) or this origin is not in the client ID's Authorized JavaScript origins.",
          );
          onError?.();
        }
      }}
    >
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        // onReady (not onLoad) also fires when the script is already on the page, e.g. after
        // client-side navigation back to this screen
        onReady={() => setScriptReady(true)}
        onError={() => {
          console.error('Failed to load https://accounts.google.com/gsi/client');
          onError?.();
        }}
      />
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill="oklch(0.78 0.16 82)"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="oklch(0.70 0.18 145)"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="oklch(0.72 0.18 5)"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="oklch(0.72 0.18 5)"
        />
      </svg>
      <div
        ref={overlayRef}
        className="absolute inset-0 flex items-center justify-center overflow-hidden opacity-0"
      >
        <div className="shrink-0 scale-[1.4]" />
      </div>
    </div>
  );
}
