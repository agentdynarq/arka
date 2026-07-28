'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Fades and lifts children into place once they enter the viewport, via
 * IntersectionObserver toggling a class rather than a scroll-position
 * library: the transition itself is `transform`/`opacity` only (GPU-friendly)
 * and is a no-op under `prefers-reduced-motion` (handled in CSS, not here).
 */
export function ScrollReveal({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          node.classList.add('is-revealed')
          observer.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`scroll-reveal${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}
