import { useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'flexible' | 'compact' | 'invisible';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript() {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-turnstile-script="true"]',
    );

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Failed to load Cloudflare Turnstile.')),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Cloudflare Turnstile.'));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

function getTurnstileLoadMessage(isLocalhost: boolean) {
  if (isLocalhost) {
    return 'This Turnstile key is not loading on localhost. Add localhost and 127.0.0.1 to the widget hostnames in Cloudflare, or set VITE_TURNSTILE_LOCAL_SITE_KEY to a key that allows local testing.';
  }

  return 'Failed to load Cloudflare Turnstile.';
}

type TurnstileWidgetProps = {
  siteKey: string;
  token: string | null;
  onTokenChange: (token: string | null) => void;
  resetKey?: number;
  isLocalhost?: boolean;
  invisible?: boolean;
};

export default function TurnstileWidget({
  siteKey,
  token,
  onTokenChange,
  resetKey = 0,
  isLocalhost = false,
  invisible = false,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    if (!siteKey || !containerRef.current) {
      setLoadError(
        isLocalhost
          ? 'Add a Turnstile site key for localhost testing before using auth on your local machine.'
          : null,
      );
      setIsLoading(false);
      return;
    }

    void loadTurnstileScript()
      .then(() => {
        if (isCancelled || !window.turnstile || !containerRef.current) {
          return;
        }

        containerRef.current.innerHTML = '';
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'light',
          size: invisible ? 'invisible' : 'flexible',
          callback: (nextToken) => onTokenChange(nextToken),
          'expired-callback': () => onTokenChange(null),
          'error-callback': () => {
            onTokenChange(null);
            setLoadError(getTurnstileLoadMessage(isLocalhost));
            setIsLoading(false);
          },
        });
        setLoadError(null);
        setIsLoading(false);
      })
      .catch((error) => {
        if (!isCancelled) {
          setLoadError(
            error instanceof Error && !isLocalhost
              ? error.message
              : getTurnstileLoadMessage(isLocalhost),
          );
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [isLocalhost, onTokenChange, siteKey]);

  useEffect(() => {
    if (!widgetIdRef.current || !window.turnstile) {
      return;
    }

    onTokenChange(null);
    window.turnstile.reset(widgetIdRef.current);
  }, [onTokenChange, resetKey]);

  if (invisible) {
    return <div ref={containerRef} className="pointer-events-none fixed bottom-0 right-0 h-0 w-0 overflow-hidden opacity-0" aria-hidden="true" />;
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700">
        <ShieldCheck className="h-4 w-4 text-[#5b45ff]" />
        Complete the security check
      </div>
      <div ref={containerRef} className="min-h-[70px]" />
      {isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Turnstile...
        </div>
      ) : null}
      {loadError ? (
        <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {loadError}
        </div>
      ) : null}
      {isLocalhost && !loadError ? (
        <div className="mt-3 text-xs text-gray-500">
          Local testing tip: this widget must allow localhost and 127.0.0.1 in Cloudflare hostname settings.
        </div>
      ) : null}
      {!isLoading && !loadError && token ? (
        <div className="mt-3 text-xs font-medium text-green-700">Security check completed.</div>
      ) : null}
    </div>
  );
}
