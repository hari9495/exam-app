import type { ReactNode } from 'react';
import { Card } from './Card';

export function Panel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 13, color: 'var(--ink)', margin: 0 }}>{title}</h3>
        {actions}
      </div>
      {children}
    </Card>
  );
}
