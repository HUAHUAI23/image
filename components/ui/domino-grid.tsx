"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"

interface DominoGridProps extends React.HTMLAttributes<HTMLDivElement> {
  squareSize?: number
  gridGap?: number
  color?: string
  width?: number
  height?: number
  className?: string
  maxOpacity?: number
  rippleSpeed?: number
  rippleDuration?: number
}

export const DominoGrid: React.FC<DominoGridProps> = ({
  squareSize = 24,
  gridGap = 1,
  color = "#808080",
  width,
  height,
  className,
  maxOpacity = 0.1,
  rippleSpeed = 0.1,
  rippleDuration = 2000,
  ...props
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isInView, setIsInView] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  // Animation state
  const ripples = useRef<
    Array<{
      x: number
      y: number
      startTime: number
    }>
  >([])
  const lastRippleTime = useRef(0)

  const setupCanvas = useCallback(
    (canvas: HTMLCanvasElement, width: number, height: number) => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const cols = Math.floor(width / squareSize)
      const rows = Math.floor(height / squareSize)

      return { cols, rows, dpr }
    },
    [squareSize],
  )

  const drawGrid = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      cols: number,
      rows: number,
      dpr: number,
      time: number,
    ) => {
      ctx.clearRect(0, 0, width, height)

      // Draw static grid lines first (mimicking the original CSS)
      ctx.lineWidth = 1
      ctx.strokeStyle = `${color}15` // Lighter opacity for elegance

      for (let i = 0; i <= cols; i++) {
        ctx.beginPath()
        ctx.moveTo(i * squareSize * dpr, 0)
        ctx.lineTo(i * squareSize * dpr, height)
        ctx.stroke()
      }

      for (let j = 0; j <= rows; j++) {
        ctx.beginPath()
        ctx.moveTo(0, j * squareSize * dpr)
        ctx.lineTo(width, j * squareSize * dpr)
        ctx.stroke()
      }

      // Draw ripples
      ripples.current.forEach((ripple) => {
        const age = time - ripple.startTime
        if (age > rippleDuration) return

        const radius = age * rippleSpeed

        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            const x = i * squareSize
            const y = j * squareSize

            // Calculate distance from ripple center
            const dx = x - ripple.x
            const dy = y - ripple.y
            const dist = Math.sqrt(dx * dx + dy * dy)

            // Check if this square is within the current ripple band
            const distFromWave = Math.abs(dist - radius)
            const waveWidth = 100 // Width of the ripple wave

            if (distFromWave < waveWidth) {
              const intensity = 1 - distFromWave / waveWidth
              // Quadratic easing for smoother fade-out
              const fade = Math.pow(1 - age / rippleDuration, 2)
              const opacity = intensity * fade * maxOpacity

              if (opacity > 0.01) {
                ctx.fillStyle = `${color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`
                ctx.fillRect(
                  i * squareSize * dpr,
                  j * squareSize * dpr,
                  squareSize * dpr,
                  squareSize * dpr
                )
              }
            }
          }
        }
      })

      // Cleanup old ripples
      ripples.current = ripples.current.filter(r => time - r.startTime < rippleDuration)
    },
    [color, squareSize, maxOpacity, rippleSpeed, rippleDuration],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsInView(true)
        } else {
          setIsInView(false)
        }
      },
      { threshold: 0 },
    )

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleResize = () => {
      if (!containerRef.current) return
      setCanvasSize({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      })
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    if (!isInView || !canvasSize.width || !canvasSize.height) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationFrameId: number

    const { cols, rows, dpr } = setupCanvas(
      canvas,
      canvasSize.width,
      canvasSize.height,
    )

    // Auto-trigger ripples occasionally
    const interval = setInterval(() => {
      if (Math.random() < 0.4) { // 40% chance every interval (more frequent)
        ripples.current.push({
          x: Math.random() * canvasSize.width,
          y: Math.random() * canvasSize.height,
          startTime: performance.now(),
        })
      }
    }, 800)

    const animate = (time: number) => {
      drawGrid(ctx, canvas.width, canvas.height, cols, rows, dpr, time)
      animationFrameId = requestAnimationFrame(animate)
    }

    animationFrameId = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animationFrameId)
      clearInterval(interval)
    }
  }, [setupCanvas, drawGrid, canvasSize, isInView])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const now = performance.now()
    if (now - lastRippleTime.current > 50) { // Throttle to every 50ms
      ripples.current.push({
        x,
        y,
        startTime: now,
      })
      lastRippleTime.current = now
    }
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
      onMouseMove={handleMouseMove}
      {...props}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none"
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
        }}
      />
    </div>
  )
}
