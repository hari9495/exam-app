'use client';

import { ReactNode } from 'react';
import { motion, MotionConfig } from 'framer-motion';

export default function LandingHero({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
        {children}
      </motion.div>
    </MotionConfig>
  );
}
