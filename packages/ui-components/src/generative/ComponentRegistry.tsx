import React from 'react';
import { DataTable } from './DataTable.js';
import { GenericCard } from './GenericCard.js';
import { FallbackComponent } from './FallbackComponent.js';

interface ToolCallRender {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Maps tool call names → React components.
 * This is the A2UI (Application-to-UI) protocol bridge.
 */
export function renderToolCall({ name, args }: ToolCallRender): React.ReactNode {
  switch (name) {
    case 'render_table':
      return (
        <DataTable
          title={args.title as string}
          headers={args.headers as string[]}
          rows={args.rows as string[][]}
        />
      );

    case 'render_card':
      return (
        <GenericCard
          title={args.title as string}
          content={args.content as string}
          footer={args.footer as string | undefined}
          icon={args.icon as string | undefined}
        />
      );

    default:
      return <FallbackComponent toolName={name} args={args} />;
  }
}
