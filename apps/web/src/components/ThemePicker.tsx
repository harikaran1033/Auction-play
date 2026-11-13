import { Check, Palette } from "lucide-react";
import { themes, useAppearance } from "../lib/appearance";
import { Button } from "./ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useAppearance();
  const next = theme === "night" ? "ember" : "night";
  const label = `Switch to ${next === "ember" ? "Ember Arena" : "Night Club"} theme`;
  return (
    <Button
      variant="secondary"
      size="icon"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      <Palette size={18} />
    </Button>
  );
}

export function ThemePicker() {
  const { theme, setTheme } = useAppearance();
  return (
    <div className="theme-picker">
      <div
        className="theme-options"
        role="radiogroup"
        aria-label="Application theme"
      >
        {themes.map((option) => (
          <label
            className={`theme-option ${theme === option.id ? "is-current" : ""}`}
            key={option.id}
          >
            <input
              type="radio"
              name="app-theme"
              value={option.id}
              checked={theme === option.id}
              onChange={() => setTheme(option.id)}
            />
            <span className={`theme-preview ${option.id}`} aria-hidden="true">
              <i />
              <b />
              <em />
              <span>
                AUCTION
                <br />
                PLAY.
              </span>
            </span>
            <span className="theme-option-title">
              {option.name}
              {theme === option.id && <Check size={16} aria-hidden="true" />}
            </span>
            <small>{option.description}</small>
          </label>
        ))}
      </div>
      <p className="muted">
        Applies instantly across the app and saves on this device. Each player
        chooses their own theme.
      </p>
    </div>
  );
}
