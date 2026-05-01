import React, { useState, useRef, useEffect } from 'react';

interface TooltipProps {
  text: string;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export default function Tooltip({ text, children, position = 'top' }: TooltipProps): JSX.Element {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !triggerRef.current || !tipRef.current) return;
    const tr = triggerRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    let top = 0, left = 0;
    switch (position) {
      case 'top':
        top = tr.top - tip.height - 8;
        left = tr.left + tr.width / 2 - tip.width / 2;
        break;
      case 'bottom':
        top = tr.bottom + 8;
        left = tr.left + tr.width / 2 - tip.width / 2;
        break;
      case 'left':
        top = tr.top + tr.height / 2 - tip.height / 2;
        left = tr.left - tip.width - 8;
        break;
      case 'right':
        top = tr.top + tr.height / 2 - tip.height / 2;
        left = tr.right + 8;
        break;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - tip.width - 8));
    top = Math.max(8, top);
    setCoords({ top, left });
  }, [visible, position]);

  return (
    <div
      ref={triggerRef}
      style={{ display: 'inline-block' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          ref={tipRef}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            background: 'rgba(0,0,0,0.9)',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            maxWidth: 240,
            zIndex: 100000,
            pointerEvents: 'none',
            whiteSpace: 'pre-wrap',
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}
