import type { MouseEvent as ReactMouseEvent } from 'react'
import { useEffect, useRef } from 'react'

interface UseModalA11yOptions {
  open: boolean
  onClose: () => void
  disableClose?: boolean
  primaryActionSelector?: string
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useModalA11y({ open, onClose, disableClose = false, primaryActionSelector }: UseModalA11yOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {return}
    const container = containerRef.current
    if (!container) {return}

    const focusable = getFocusable(container)
    focusable[0]?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !disableClose) {
        onClose()
        return
      }
      if (event.key === 'Enter' && primaryActionSelector) {
        const target = event.target as HTMLElement | null
        const targetTag = target?.tagName?.toLowerCase()
        const isFormField = targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select'
        const isButtonLike = targetTag === 'button' || targetTag === 'a'
        if (!isFormField && !isButtonLike) {
          const primaryAction = container.querySelector<HTMLElement>(primaryActionSelector)
          if (primaryAction) {
            primaryAction.click()
            return
          }
        }
      }
      if (event.key !== 'Tab') {return}
      const nodes = getFocusable(container)
      if (!nodes.length) {return}
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [disableClose, onClose, open, primaryActionSelector])

  const onOverlayMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!disableClose && event.target === event.currentTarget) {
      onClose()
    }
  }

  return { containerRef, onOverlayMouseDown }
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true',
  )
}
