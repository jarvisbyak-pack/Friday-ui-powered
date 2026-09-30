import React from 'react';
import { ShieldCheck, Zap } from 'lucide-react';

export type FridayFace = 'careful' | 'autonomous';

interface FaceModeSwitchProps {
  face: FridayFace;
  onChange: (face: FridayFace) => void;
}

export const FaceModeSwitch: React.FC<FaceModeSwitchProps> = ({ face, onChange }) => {
  const autonomous = face === 'autonomous';

  return (
    <div className="friday-face-switch" role="group" aria-label="Friday character mode">
      <div className="friday-face-label">
        <span className="friday-face-dot" />
        <span>FRIDAY FACE</span>
      </div>
      <div className="friday-face-options">
        <button
          type="button"
          onClick={() => onChange('careful')}
          aria-pressed={!autonomous}
          className={!autonomous ? 'active' : ''}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Careful
        </button>
        <button
          type="button"
          onClick={() => onChange('autonomous')}
          aria-pressed={autonomous}
          className={autonomous ? 'active autonomous' : ''}
        >
          <Zap className="w-3.5 h-3.5" />
          Autonomous
        </button>
      </div>
    </div>
  );
};
