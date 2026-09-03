import type { ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import './v2.css';

export default function V2Layout({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="v2" style={{ minHeight: '100vh' }}>
        {children}
      </div>
    </MotionConfig>
  );
}
