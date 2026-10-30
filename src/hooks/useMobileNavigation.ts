import { useEffect } from 'react';

export function useMobileNavigation(open: boolean, setOpen: (open: boolean) => void, id: string, breakpoint: number) {
  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia(`(max-width: ${breakpoint}px)`);
    if (!media.matches) { setOpen(false); return; }
    const previousOverflow = document.body.style.overflow;
    const trigger = document.querySelector<HTMLButtonElement>(`[aria-controls="${id}"]`);
    const menu = document.getElementById(id);
    document.body.style.overflow = 'hidden';
    menu?.querySelector<HTMLElement>('a')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); return; }
      if (event.key !== 'Tab') return;
      const items = [...(menu?.querySelectorAll<HTMLElement>('a[href], button') ?? []), ...(trigger ? [trigger] : [])];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const onResize = () => { if (!media.matches) setOpen(false); };
    document.addEventListener('keydown', onKey);
    media.addEventListener('change', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      media.removeEventListener('change', onResize);
      trigger?.focus();
    };
  }, [open, setOpen, id, breakpoint]);
}
