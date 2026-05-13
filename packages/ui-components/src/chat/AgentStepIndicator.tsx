import React from 'react';
import './AgentStepIndicator.css';

interface AgentStepIndicatorProps {
  step: number;
  totalSteps?: number;
  action: string;
  target?: string;
  status?: 'pending' | 'executing' | 'completed' | 'error';
}

export const AgentStepIndicator: React.FC<AgentStepIndicatorProps> = ({
  step,
  totalSteps,
  action,
  target,
  status = 'completed'
}) => {
  return (
    <div className={`agent-step-indicator agent-step-indicator--${status}`} id={`agent-step-${step}`}>
      <div className="agent-step-indicator__header">
        <span className="agent-step-indicator__badge">Step {step}{totalSteps ? `/${totalSteps}` : ''}</span>
        <span className="agent-step-indicator__action">{action}</span>
      </div>
      {target && (
        <div className="agent-step-indicator__target">
          Target: <code className="agent-step-indicator__code">{target}</code>
        </div>
      )}
    </div>
  );
};
