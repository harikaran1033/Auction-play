import type { CSSProperties } from "react";
import type { Team } from "@cricket/shared";

export function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((value) => {
      const n = parseInt(value, 16) / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
export function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
export function teamTheme(team?: Pick<Team, "color">) {
  const primary = /^#[0-9a-f]{6}$/i.test(team?.color ?? "")
    ? team!.color
    : "#b39aff";
  const onPrimary =
    contrast(primary, "#000000") >= contrast(primary, "#ffffff")
      ? "#000000"
      : "#ffffff";
  let accent = primary;
  for (let step = 1; contrast(accent, "#171020") < 4.5 && step <= 10; step++) {
    accent =
      "#" +
      primary
        .slice(1)
        .match(/../g)!
        .map((channel) => {
          const value = parseInt(channel, 16);
          return Math.round(value + ((255 - value) * step) / 10)
            .toString(16)
            .padStart(2, "0");
        })
        .join("");
  }
  return { primary, onPrimary, accent, tint: `${primary}26` };
}
export function teamStyle(team?: Pick<Team, "color">): CSSProperties {
  const theme = teamTheme(team);
  return {
    "--team-primary": theme.primary,
    "--team-color": theme.accent,
    "--team-on-primary": theme.onPrimary,
    "--team-accent": theme.accent,
    "--team-tint": theme.tint,
  } as CSSProperties;
}
