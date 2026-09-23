import React, { useRef } from 'react';

/**
 * Vertical drag handle for resizing side panels.
 * onDrag(dx) is called with the pixels moved since the drag started (positive = right).
 * Double-click calls onReset.
 */
export function ResizeHandle({ onDragStart, onDrag, onDragEnd, onReset, title = 'Drag to resize · double-click to reset' }) {
  const active = useRef(false);

  const start = (e) => {
    e.preventDefault();
    const startX = e.touches ? e.touches[0].clientX : e.clientX;
    active.current = true;
    onDragStart?.();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const move = (ev) => {
      const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
      onDrag(x - startX);
    };
    const end = () => {
      active.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      onDragEnd?.();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
  };

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      title={title}
      onMouseDown={start}
      onTouchStart={start}
      onDoubleClick={onReset}
    >
      <span className="resize-grip" />
    </div>
  );
}
