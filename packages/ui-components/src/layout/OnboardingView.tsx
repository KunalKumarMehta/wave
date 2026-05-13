import React, { useState } from 'react';
import './OnboardingView.css';

interface OnboardingProps {
  onComplete: (apiKey: string, provider: string) => void;
  onSkip: () => void;
}

export const OnboardingView: React.FC<OnboardingProps> = ({ onComplete, onSkip }) => {
  const [step, setStep] = useState(1);
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);

  return (
    <div className="onboarding">
      <div className="onboarding__container">
        {step === 1 && (
          <div className="onboarding__step onboarding__step--1">
            <div className="onboarding__logo">◉</div>
            <h1 className="onboarding__title">Welcome to Wave</h1>
            <p className="onboarding__text">
              The AI-native browser assistant that helps you browse smarter, not harder.
            </p>
            <button className="onboarding__button" onClick={nextStep}>
              Get Started
            </button>
            <button className="onboarding__skip" onClick={onSkip}>Skip for now</button>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding__step onboarding__step--2">
            <h2 className="onboarding__title">Choose a Provider</h2>
            <p className="onboarding__text">Select the AI model you want to use.</p>
            <div className="onboarding__providers">
              {['openai', 'anthropic', 'gemini'].map(p => (
                <button 
                  key={p} 
                  className={`onboarding__provider ${provider === p ? 'active' : ''}`}
                  onClick={() => setProvider(p)}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <div className="onboarding__footer">
              <button className="onboarding__button secondary" onClick={prevStep}>Back</button>
              <button className="onboarding__button" onClick={nextStep}>Next</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding__step onboarding__step--3">
            <h2 className="onboarding__title">Enter API Key</h2>
            <p className="onboarding__text">Your key is stored securely on your device.</p>
            <input 
              type="password" 
              className="onboarding__input"
              placeholder={`Enter your ${provider} API key`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div className="onboarding__footer">
              <button className="onboarding__button secondary" onClick={prevStep}>Back</button>
              <button 
                className="onboarding__button" 
                onClick={() => onComplete(apiKey, provider)}
                disabled={!apiKey}
              >
                Finish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
