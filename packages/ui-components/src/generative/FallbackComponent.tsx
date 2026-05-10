import React from 'react';

interface FallbackComponentProps {
  toolName: string;
  args: Record<string, unknown>;
}

export function FallbackComponent({ toolName, args }: FallbackComponentProps) {
  return (
    <div style={{
      borderRadius: 'var(--wave-radius-md)',
      border: '1px solid var(--wave-border)',
      overflow: 'hidden',
      background: 'var(--wave-bg-secondary)',
      fontSize: '12px',
    }}>
      <div style={{
        padding: '8px 12px',
        background: 'var(--wave-bg-tertiary)',
        borderBottom: '1px solid var(--wave-border)',
        color: 'var(--wave-text-muted)',
        fontFamily: 'var(--wave-font-mono)',
      }}>
        Unknown component: {toolName}
      </div>
      <pre style={{
        padding: '10px 12px',
        margin: 0,
        fontFamily: 'var(--wave-font-mono)',
        color: 'var(--wave-text-secondary)',
        overflowX: 'auto',
        fontSize: '11px',
        lineHeight: 1.5,
      }}>
        {JSON.stringify(args, null, 2)}
      </pre>
    </div>
  );
}
