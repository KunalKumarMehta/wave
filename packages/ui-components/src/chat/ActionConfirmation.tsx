import React from 'react';
import './ActionConfirmation.css';

interface ActionConfirmationProps {
  action: string;
  params: Record<string, any>;
  onAllow: () => void;
  onDeny: () => void;
}

export const ActionConfirmation: React.FC<ActionConfirmationProps> = ({
  action,
  params,
  onAllow,
  onDeny,
}) => {
  const target = params.name || params.text || params.url || params.ref || 'target';

  return (
    <div className="action-confirmation" id="action-confirmation-bubble">
      <div className="action-confirmation__message">
        Wave wants to: <strong>{action}</strong> <code>{target}</code>
      </div>
      <div className="action-confirmation__actions">
        <button 
          id="action-deny-btn"
          className="action-confirmation__button action-confirmation__button--deny" 
          onClick={onDeny}
        >
          ❌ Deny
        </button>
        <button 
          id="action-allow-btn"
          className="action-confirmation__button action-confirmation__button--allow" 
          onClick={onAllow}
        >
          ✅ Allow
        </button>
      </div>
    </div>
  );
};
