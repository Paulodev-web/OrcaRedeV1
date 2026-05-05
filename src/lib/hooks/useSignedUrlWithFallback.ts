'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSignedUrlResult {
  url: string | null;
  error: boolean;
  loading: boolean;
  retry: () => void;
}

/**
 * Validates a signed URL by preloading the resource. If the URL fails
 * to load (404, 403, network error), returns `error: true` so callers
 * can show a fallback visual.
 *
 * For images, uses an `Image()` preload. For other media, uses a HEAD
 * fetch. If `signedUrl` is null/undefined from the start, immediately
 * returns error state.
 */
export function useSignedUrlWithFallback(
  signedUrl: string | null | undefined,
  kind: 'image' | 'video' | 'audio' = 'image',
): UseSignedUrlResult {
  const [state, setState] = useState<{
    url: string | null;
    error: boolean;
    loading: boolean;
  }>(() => ({
    url: signedUrl ?? null,
    error: !signedUrl,
    loading: !!signedUrl,
  }));

  const mountedRef = useRef(true);
  const urlRef = useRef(signedUrl);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const validate = useCallback(
    (urlToCheck: string | null | undefined) => {
      if (!urlToCheck) {
        setState({ url: null, error: true, loading: false });
        return;
      }

      setState({ url: urlToCheck, error: false, loading: true });

      if (kind === 'image') {
        const img = new Image();
        img.onload = () => {
          if (mountedRef.current) {
            setState({ url: urlToCheck, error: false, loading: false });
          }
        };
        img.onerror = () => {
          if (mountedRef.current) {
            setState({ url: null, error: true, loading: false });
          }
        };
        img.src = urlToCheck;
      } else {
        fetch(urlToCheck, { method: 'HEAD', mode: 'no-cors' })
          .then(() => {
            if (mountedRef.current) {
              setState({ url: urlToCheck, error: false, loading: false });
            }
          })
          .catch(() => {
            if (mountedRef.current) {
              setState({ url: null, error: true, loading: false });
            }
          });
      }
    },
    [kind],
  );

  useEffect(() => {
    if (signedUrl !== urlRef.current) {
      urlRef.current = signedUrl;
      validate(signedUrl);
    }
  }, [signedUrl, validate]);

  const retry = useCallback(() => {
    validate(urlRef.current);
  }, [validate]);

  return { ...state, retry };
}

/**
 * Renders a consistent fallback for broken media, to be used by any
 * component that displays user-uploaded content.
 */
export function getMediaFallbackProps(kind: 'image' | 'video' | 'audio') {
  const labels: Record<string, string> = {
    image: 'Mídia indisponível',
    video: 'Vídeo indisponível',
    audio: 'Áudio indisponível',
  };
  return { label: labels[kind] ?? 'Mídia indisponível' };
}
