'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

type DismissEvent = {
  detail: { originalEvent: Event }
  preventDefault: () => void
  defaultPrevented: boolean
}

const GalleryDialogContext = React.createContext<{
  open: boolean
  isVisible: boolean
  isAnimating: boolean
  modal: boolean
  overlayBlur: boolean | string
  overlayColor: string
  triggerRect: DOMRect | null
  onOpenChange: (open: boolean) => void
} | null>(null)

const useGalleryDialogContext = (component: string) => {
  const context = React.useContext(GalleryDialogContext)
  if (!context) {
    throw new Error(`${component} must be used within <GalleryDialog>`)
  }
  return context
}

const createDismissEvent = (originalEvent: Event): DismissEvent => {
  let prevented = originalEvent.defaultPrevented
  return {
    detail: { originalEvent },
    preventDefault: () => {
      prevented = true
      originalEvent.preventDefault()
    },
    get defaultPrevented() {
      return prevented
    },
  }
}

const useLockBodyScroll = (locked: boolean) => {
  React.useEffect(() => {
    if (!locked) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [locked])
}

interface GalleryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modal?: boolean
  /**
   * Control the blur intensity of the overlay.
   * - `boolean`: `true` defaults to 'sm', `false` disables blur.
   * - `string`: Tailwind blur class suffix, e.g., 'sm', 'md', 'lg', 'xl', '2xl', '3xl'.
   */
  overlayBlur?: boolean | string
  /**
   * Control the background color and opacity of the overlay.
   * Pass a Tailwind CSS class, e.g., 'bg-black/60', 'bg-white/80'.
   * Default: 'bg-black/60'
   */
  overlayColor?: string
  /**
   * The bounding rectangle of the trigger element (e.g., the image card).
   * Used to calculate the `transform-origin` for the "Genie" zoom animation,
   * making the modal appear to expand from the clicked element.
   */
  triggerRect?: DOMRect | null
  children: React.ReactNode
}

export function GalleryDialog({
  open,
  onOpenChange,
  modal = true,
  overlayBlur = false,
  overlayColor = 'bg-black/60',
  triggerRect = null,
  children,
}: GalleryDialogProps) {
  const [isVisible, setIsVisible] = React.useState(open)
  const [isAnimating, setIsAnimating] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setIsVisible(true)
      // Use setTimeout instead of requestAnimationFrame for more reliable entry animation
      const timer = setTimeout(() => {
        setIsAnimating(true)
      }, 50)
      return () => clearTimeout(timer)
    } else {
      setIsAnimating(false)
      // Increased timeout slightly to ensure animation completes (300ms animation)
      const timer = setTimeout(() => setIsVisible(false), 350)
      return () => clearTimeout(timer)
    }
  }, [open])

  return (
    <GalleryDialogContext.Provider
      value={{
        open,
        isVisible,
        isAnimating,
        onOpenChange,
        modal,
        overlayBlur,
        overlayColor,
        triggerRect,
      }}
    >
      {children}
    </GalleryDialogContext.Provider>
  )
}

const GalleryDialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'> & {
    showCloseButton?: boolean
    onPointerDownOutside?: (event: DismissEvent) => void
    onInteractOutside?: (event: DismissEvent) => void
    onEscapeKeyDown?: (event: DismissEvent) => void
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
  const {
    open,
    isVisible,
    isAnimating,
    modal,
    overlayBlur,
    overlayColor,
    triggerRect,
    onOpenChange,
  } = useGalleryDialogContext('GalleryDialogContent')
  const contentRef = React.useRef<HTMLDivElement | null>(null)

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node
      if (typeof forwardedRef === 'function') {
        forwardedRef(node)
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      }
    },
    [forwardedRef]
  )

  useLockBodyScroll(open && modal)

  React.useEffect(() => {
    if (!open || !modal) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const dismissEvent = createDismissEvent(event)
      onEscapeKeyDown?.(dismissEvent)
      if (!dismissEvent.defaultPrevented) {
        onOpenChange(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, modal, onEscapeKeyDown, onOpenChange])

  React.useEffect(() => {
    if (open && contentRef.current) {
      contentRef.current.focus()
    }
  }, [open])

  // Calculate transform origin based on triggerRect
  const transformOrigin = React.useMemo(() => {
    if (!triggerRect) return 'center center'
    const x = triggerRect.left + triggerRect.width / 2
    const y = triggerRect.top + triggerRect.height / 2
    return `${x}px ${y}px`
  }, [triggerRect])

  if (!isVisible) return null

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!modal || contentRef.current?.contains(event.target as Node)) return
    const dismissEvent = createDismissEvent(event.nativeEvent)
    onPointerDownOutside?.(dismissEvent)
    if (!dismissEvent.defaultPrevented) {
      onOpenChange(false)
    }
  }

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!modal || contentRef.current?.contains(event.target as Node)) return
    const dismissEvent = createDismissEvent(event.nativeEvent)
    onInteractOutside?.(dismissEvent)
    if (!dismissEvent.defaultPrevented) {
      onOpenChange(false)
    }
  }

  return createPortal(
    <div
      data-slot="dialog-portal"
      data-state={isAnimating ? 'open' : 'closed'}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <div
        data-slot="dialog-overlay"
        data-state={isAnimating ? 'open' : 'closed'}
        className={cn(
          'fixed inset-0 transition-opacity duration-300 ease-in-out',
          overlayColor,
          overlayBlur === true && 'backdrop-blur-sm',
          typeof overlayBlur === 'string' && `backdrop-blur-${overlayBlur}`,
          'opacity-0 data-[state=open]:opacity-100',
          !modal && 'pointer-events-none opacity-0'
        )}
        aria-hidden
      />

      <div
        ref={setRefs}
        role="dialog"
        aria-modal={modal}
        tabIndex={-1}
        data-slot="dialog-content"
        data-state={isAnimating ? 'open' : 'closed'}
        style={{ transformOrigin }}
        className={cn(
          'relative z-50 grid w-full max-w-lg gap-4 bg-background p-6 shadow-lg transition-all duration-300 ease-out',
          'opacity-0 scale-0',
          'data-[state=open]:opacity-100 data-[state=open]:scale-100',
          'sm:rounded-lg',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <button
            type="button"
            data-slot="dialog-close"
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        )}
      </div>
    </div>,
    document.body
  )
})

const GalleryDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<'h2'>
>(function GalleryDialogTitle({ className, ...props }, ref) {
  return (
    <h2
      ref={ref}
      data-slot="dialog-title"
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
})

export { GalleryDialogContent, GalleryDialogTitle }
