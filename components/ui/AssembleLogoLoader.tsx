'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import React from 'react';

type Piece = {
  src: string;
  from?: { x?: number; y?: number; rotate?: number; scale?: number };
  delay?: number;
  alt?: string;
};

type Props = {
  pieces: [Piece, Piece, Piece];
  finalOverlaySrc?: string;
  size?: number;
  text?: string;
  className?: string;
};

export default function AssembleLogoLoader({
  pieces,
  finalOverlaySrc,
  size = 140,
  text,
  className = '',
}: Props) {
  return (
    <div className={['flex flex-col items-center gap-4', className].join(' ')}>
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            filter: 'blur(10px)',
            background:
              'radial-gradient(60% 60% at 50% 50%, rgba(59,130,246,.25), transparent 70%)',
            borderRadius: 9999,
          }}
        />

        {pieces.map((p, i) => {
          const delay = (p.delay ?? i * 0.12) as number;
          return (
            <motion.div
              key={p.src}
              className="absolute inset-0"
              initial={{
                x: p.from?.x ?? (i === 0 ? -220 : i === 1 ? 220 : 0),
                y: p.from?.y ?? (i === 2 ? 220 : 0),
                rotate: p.from?.rotate ?? (i === 0 ? -12 : i === 1 ? 12 : 6),
                scale: p.from?.scale ?? 0.9,
                opacity: 0,
              }}
              animate={{
                x: 0,
                y: 0,
                rotate: 0,
                scale: 1,
                opacity: 1,
                transition: { delay, duration: 0.55, ease: 'easeOut' },
              }}
            >
              <motion.div
                className="absolute inset-0"
                animate={{ scale: [1, 1.03, 1] }}
                transition={{
                  repeat: Infinity,
                  repeatType: 'mirror',
                  duration: 2.2,
                  delay: 0.7,
                }}
              >
                <Image
                  src={p.src}
                  alt={p.alt ?? `piece-${i + 1}`}
                  fill
                  sizes={`${size}px`}
                  className="select-none object-contain"
                  priority
                />
              </motion.div>
            </motion.div>
          );
        })}

        {finalOverlaySrc && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            <Image
              src={finalOverlaySrc}
              alt="logo"
              fill
              sizes={`${size}px`}
              className="select-none object-contain"
              priority
            />
          </motion.div>
        )}
      </div>

      {text && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm opacity-80"
        >
          {text}
        </motion.div>
      )}
    </div>
  );
}
