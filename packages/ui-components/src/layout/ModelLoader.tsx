import React from 'react';
import './ModelLoader.css';

interface ModelLoaderProps {
  progress: number;
  onSkip: () => void;
  statusText?: string;
}

export const ModelLoader: React.FC<ModelLoaderProps> = ({ progress, onSkip, statusText }) => {
  return (
    <div className="model-loader">
      <div className="model-loader__content">
        <div className="model-loader__spinner"></div>
        <h2 className="model-loader__title">Optimizing your experience...</h2>
        <p className="model-loader__text">
          {statusText || 'Downloading local AI model for faster intent detection. This happens only once (~200MB).'}
        </p>
        
        <div className="model-loader__progress-container">
          <div 
            className="model-loader__progress-bar" 
            style={{ width: `${Math.round(progress * 100)}%` }}
          ></div>
        </div>
        <div className="model-loader__percentage">
          {Math.round(progress * 100)}%
        </div>

        <button className="model-loader__skip" onClick={onSkip}>
          Skip & use cloud only
        </button>
      </div>
    </div>
  );
};
