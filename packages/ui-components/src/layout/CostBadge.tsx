import './CostBadge.css';

interface CostBadgeProps {
  totalCost: number;
  totalTokens: number;
  budget?: number | null;
  onClick?: () => void;
}

export function CostBadge({ totalCost, totalTokens, budget, onClick }: CostBadgeProps) {
  const formatCost = (cost: number): string => {
    if (cost === 0) return '$0';
    if (cost < 0.001) return '<$0.001';
    if (cost < 0.01) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(2)}`;
  };

  const formatTokens = (tokens: number): string => {
    if (tokens < 1000) return `${tokens}`;
    if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  };

  const budgetPercent = budget ? Math.min(100, (totalCost / budget) * 100) : 0;
  const isWarning = budget ? budgetPercent > 80 : false;

  return (
    <button
      className={`cost-badge ${isWarning ? 'cost-badge--warning' : ''}`}
      onClick={onClick}
      title={`${formatTokens(totalTokens)} tokens · ${formatCost(totalCost)}${budget ? ` / ${formatCost(budget)} budget` : ''}`}
    >
      <span className="cost-badge__tokens">{formatTokens(totalTokens)}</span>
      <span className="cost-badge__separator">·</span>
      <span className="cost-badge__cost">{formatCost(totalCost)}</span>
      {budget && (
        <div className="cost-badge__budget-bar">
          <div
            className="cost-badge__budget-fill"
            style={{ width: `${budgetPercent}%` }}
          />
        </div>
      )}
    </button>
  );
}
