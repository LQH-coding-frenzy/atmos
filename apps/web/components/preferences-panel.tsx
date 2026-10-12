'use client';

import { Settings2 } from 'lucide-react';

export type ThemePreference = 'system' | 'light' | 'dark';

const themes: Array<{ label: string; value: ThemePreference }> = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

type PreferencesPanelProps = {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
};

export function PreferencesPanel({ theme, onThemeChange }: PreferencesPanelProps) {
  return (
    <details className="preferences-panel" name="dashboard-tools">
      <summary aria-controls="preferences-content">
        <Settings2 size={17} aria-hidden="true" />
        <span>Settings</span>
      </summary>
      <section className="preferences-popover" id="preferences-content">
        <h2>Appearance</h2>
        <fieldset>
          <legend>Color theme</legend>
          <div className="preference-segmented" role="group" aria-label="Color theme">
            {themes.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={theme === option.value}
                className={theme === option.value ? 'active' : ''}
                onClick={() => onThemeChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        <p>Theme and temperature units are saved on this device.</p>
      </section>
    </details>
  );
}
