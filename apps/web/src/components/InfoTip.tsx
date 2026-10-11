import { useRef, useState, type ReactNode } from 'react';

const WIDTH = 288; // px, matches .info-tip-body max-width
const MARGIN = 8;

/**
 * A small ⓘ that shows an explanation on hover or keyboard focus. The bubble is
 * positioned in viewport coordinates (position: fixed) so scrolling panels do not
 * clip it, and it is kept inside the window.
 */
export function InfoTip({ children }: { children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const show = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - WIDTH / 2, MARGIN), window.innerWidth - WIDTH - MARGIN);
    setPosition({ left, top: rect.bottom + 6 });
  };
  const hide = () => setPosition(null);

  return (
    <span ref={anchor} className="info-tip" tabIndex={0} aria-label="Açıklama"
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      ⓘ
      {position && (
        <span className="info-tip-body" role="tooltip" style={{ left: position.left, top: position.top, width: WIDTH }}>
          {children}
        </span>
      )}
    </span>
  );
}
