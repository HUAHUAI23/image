'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

type DismissEvent = {
  detail: { originalEvent: Event };
  preventDefault: () => void;
  defaultPrevented: boolean;
};

const GalleryDialogContext = React.createContext<{
  open: boolean;
  modal: boolean;
  onOpenChange: (open: boolean) => void;
} | null>(null);

const useGalleryDialogContext = (component: string) => {
  const context = React.useContext(GalleryDialogContext);
  if (!context) {
    throw new Error(`${component} must be used within <GalleryDialog>`);
  }
  return context;
};

const createDismissEvent = (originalEvent: Event): DismissEvent => {
  let prevented = originalEvent.defaultPrevented;
  return {
    detail: { originalEvent },
    preventDefault: () => {
      prevented = true;
      originalEvent.preventDefault();
    },
    get defaultPrevented() {
      return prevented;
    },
  };
};

const useLockBodyScroll = (locked: boolean) => {
  React.useEffect(() => {
    if (!locked) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [locked]);
};

interface GalleryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modal?: boolean;
  children: React.ReactNode;
}

export function GalleryDialog({ open, onOpenChange, modal = true, children }: GalleryDialogProps) {
  return (
    <GalleryDialogContext.Provider value={{ open, onOpenChange, modal }}>
      {children}
    </GalleryDialogContext.Provider>
  );
}

const GalleryDialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'> & {
    showCloseButton?: boolean;
    onPointerDownOutside?: (event: DismissEvent) => void;
    onInteractOutside?: (event: DismissEvent) => void;
    onEscapeKeyDown?: (event: DismissEvent) => void;
  }
>(function GalleryDialogContent(
  {
    className,
    children,
    showCloseButton = true,
    onPointerDownOutside,
    onInteractOutside,
    onEscapeKeyDown,
    ...props
  },
  forwardedRef
) {
  const { open, modal, onOpenChange } = useGalleryDialogContext('GalleryDialogContent');
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [forwardedRef]
  );

  useLockBodyScroll(open && modal);

  React.useEffect(() => {
    if (!open || !modal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const dismissEvent = createDismissEvent(event);
      onEscapeKeyDown?.(dismissEvent);
      if (!dismissEvent.defaultPrevented) {
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, modal, onEscapeKeyDown, onOpenChange]);

  React.useEffect(() => {
    if (open && contentRef.current) {
      contentRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!modal || contentRef.current?.contains(event.target as Node)) return;
    const dismissEvent = createDismissEvent(event.nativeEvent);
    onPointerDownOutside?.(dismissEvent);
    if (!dismissEvent.defaultPrevented) {
      onOpenChange(false);
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!modal || contentRef.current?.contains(event.target as Node)) return;
    const dismissEvent = createDismissEvent(event.nativeEvent);
    onInteractOutside?.(dismissEvent);
    if (!dismissEvent.defaultPrevented) {
      onOpenChange(false);
    }
  };

  return createPortal(
    <div
      data-slot="dialog-portal"
      data-state={open ? 'open' : 'closed'}
      className="fixed inset-0 z-50"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <div
        data-slot="dialog-overlay"
        data-state={open ? 'open' : 'closed'}
        className={cn(
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 bg-black/50',
          !modal && 'pointer-events-none'
        )}
        aria-hidden
      />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          ref={setRefs}
          role="dialog"
          aria-modal={modal}
          tabIndex={-1}
          data-slot="dialog-content"
          data-state={open ? 'open' : 'closed'}
          className={cn(
            'bg-background pointer-events-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <button
              type="button"
              data-slot="dialog-close"
              className="ring-offset-background focus:ring-ring absolute right-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
              onClick={() => onOpenChange(false)}
            >
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
});

const GalleryDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<'h2'>
>(function GalleryDialogTitle({ className, ...props }, ref) {
  return (
    <h2
      ref={ref}
      data-slot="dialog-title"
      className={cn('text-lg font-semibold leading-none', className)}
      {...props}
    />
  );
});

export { GalleryDialogContent, GalleryDialogTitle };
