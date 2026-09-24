import { useEffect, useState } from 'react';

// true on phones / narrow windows (≤ 768px wide)
export const MOBILE_QUERY = '(max-width: 768px)';

export function useIsMobile() {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MOBILE_QUERY).matches : false);
  const [mobile, setMobile] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on); };
  }, []);
  return mobile;
}
