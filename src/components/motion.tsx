'use client';

import { useEffect } from 'react';

const revealSelector = '.hero-copy, .hero-art, .page-heading, .school-card, .teacher-card, .alumni-card, .panel, .metric, .aside-card, .community-banner, .section-heading';

/** Content stays visible before hydration and when observation is unavailable. */
export function MotionEnhancer() {
  useEffect(() => {
    const main = document.getElementById('main');
    if (!main || !('IntersectionObserver' in window)) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const seen = new WeakSet<Element>();
    const observed = new Set<HTMLElement>();
    const active = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    let observer: IntersectionObserver | undefined;
    let scheduledFrame = 0;

    const finish = (element: HTMLElement) => {
      const timer = active.get(element);
      if (timer) clearTimeout(timer);
      active.delete(element);
      element.removeAttribute('data-educlar-reveal');
      element.style.removeProperty('--educlar-reveal-delay');
    };

    const clear = () => {
      observer?.disconnect();
      observer = undefined;
      observed.clear();
      for (const element of active.keys()) finish(element);
    };

    const scan = () => {
      scheduledFrame = 0;
      if (preference.matches) return;
      observer ??= new IntersectionObserver(entries => {
        let delayIndex = 0;
        for (const entry of entries) {
          const element = entry.target as HTMLElement;
          if (!entry.isIntersecting) continue;
          observer?.unobserve(element);
          observed.delete(element);
          seen.add(element);
          // Never animate away the current keyboard focus or its surrounding form.
          if (preference.matches || element.contains(document.activeElement)) continue;
          const delay = Math.min(delayIndex++, 3) * 35;
          element.style.setProperty('--educlar-reveal-delay', `${delay}ms`);
          element.setAttribute('data-educlar-reveal', 'true');
          active.set(element, setTimeout(() => finish(element), 550));
        }
      }, { threshold: 0.08 });

      for (const element of observed) {
        if (!element.isConnected) {
          observer.unobserve(element);
          observed.delete(element);
        }
      }
      for (const element of main.querySelectorAll<HTMLElement>(revealSelector)) {
        if (seen.has(element) || observed.has(element)) continue;
        // Reveal a card/panel once, without also animating every nested section.
        if (element.parentElement?.closest(revealSelector)) continue;
        observed.add(element);
        observer.observe(element);
      }
    };

    const scheduleScan = () => {
      if (!scheduledFrame) scheduledFrame = requestAnimationFrame(scan);
    };
    const handlePreference = () => {
      if (preference.matches) clear();
      else scheduleScan();
    };
    const handleAnimationEnd = (event: AnimationEvent) => {
      if (event.animationName === 'educlar-reveal' && event.target instanceof HTMLElement) finish(event.target);
    };
    const handleFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest<HTMLElement>('[data-educlar-reveal]');
      if (element) finish(element);
    };
    // Handles route navigation and streamed content without coupling to router state.
    const mutations = new MutationObserver(scheduleScan);
    mutations.observe(main, { childList: true, subtree: true });
    preference.addEventListener('change', handlePreference);
    main.addEventListener('animationend', handleAnimationEnd);
    main.addEventListener('focusin', handleFocus);
    scheduleScan();

    return () => {
      if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
      mutations.disconnect();
      preference.removeEventListener('change', handlePreference);
      main.removeEventListener('animationend', handleAnimationEnd);
      main.removeEventListener('focusin', handleFocus);
      clear();
    };
  }, []);

  return null;
}
