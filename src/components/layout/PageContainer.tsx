import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
    >
      {children}
    </motion.div>
  );
}
