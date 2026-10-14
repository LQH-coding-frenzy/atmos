'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';

export function WeatherTools({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        className="tools-trigger"
        type="button"
        aria-label="Open weather tools"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <SlidersHorizontal size={19} aria-hidden="true" />
        <span>Tools</span>
      </button>
      <dialog
        className="weather-tools-dialog"
        ref={dialog}
        aria-labelledby="weather-tools-title"
        onClose={(event) => {
          for (const panel of event.currentTarget.querySelectorAll<HTMLDetailsElement>(
            'details[name="dashboard-tools"][open]',
          )) {
            panel.open = false;
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          ) {
            dialog.current?.close();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
              ),
            ).filter((element) => {
              if (!element.getClientRects().length) return false;
              let parent = element.parentElement;
              while (parent && parent !== event.currentTarget) {
                if (
                  parent instanceof HTMLDetailsElement &&
                  !parent.open &&
                  parent.querySelector(':scope > summary') !== element
                )
                  return false;
                parent = parent.parentElement;
              }
              return true;
            });
            const first = controls[0];
            const last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
          if (event.key !== 'Escape') return;
          const panel = dialog.current?.querySelector<HTMLDetailsElement>(
            'details[name="dashboard-tools"][open]',
          );
          if (!panel) return;
          event.preventDefault();
          event.stopPropagation();
          panel.open = false;
          panel.querySelector('summary')?.focus();
        }}
      >
        <header className="tools-heading">
          <div>
            <p className="eyebrow">A little more perspective</p>
            <h2 id="weather-tools-title">Weather tools</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close weather tools"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="tool-list">{children}</div>
      </dialog>
    </>
  );
}
