'use client'

import React from 'react'
import { motion } from 'motion/react'

import { cn } from '@/lib/utils'

export const BoxesBackgroundCore = ({ className, ...rest }: { className?: string }) => {
  const rows = new Array(100).fill(1)
  const cols = new Array(80).fill(1)

  // Colors that match the project's color scheme
  const colors = [
    'oklch(0.75 0.12 264)', // blue
    'oklch(0.75 0.12 180)', // teal
    'oklch(0.75 0.12 330)', // pink
    'oklch(0.75 0.12 84)', // yellow
    'oklch(0.75 0.12 145)', // green
    'oklch(0.75 0.10 286)', // purple
  ]

  const getRandomColor = () => {
    return colors[Math.floor(Math.random() * colors.length)]
  }

  return (
    <div
      style={{
        transform: `translate(-40%,-60%) skewX(-48deg) skewY(14deg) scale(0.675) rotate(0deg) translateZ(0)`,
      }}
      className={cn(
        'absolute -top-1/4 left-1/4 z-0 flex h-[200%] w-[200%] -translate-x-1/2 -translate-y-1/2 p-4',
        className
      )}
      {...rest}
    >
      {rows.map((_, i) => (
        <motion.div
          key={`row` + i}
          className="relative h-10 w-20 border-l border-muted-foreground/15"
        >
          {cols.map((_, j) => (
            <motion.div
              whileHover={{
                backgroundColor: `${getRandomColor()}`,
                transition: { duration: 0 },
              }}
              animate={{
                transition: { duration: 2 },
              }}
              key={`col` + j}
              className="relative h-10 w-20 border-r border-t border-muted-foreground/15"
            >
              {j % 2 === 0 && i % 2 === 0 ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  className="pointer-events-none absolute -left-[26px] -top-[18px] h-7 w-12 stroke-[1px] text-muted-foreground/25"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                </svg>
              ) : null}
            </motion.div>
          ))}
        </motion.div>
      ))}
    </div>
  )
}

export const BoxesBackground = React.memo(BoxesBackgroundCore)
