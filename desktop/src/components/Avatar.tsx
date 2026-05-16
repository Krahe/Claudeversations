// The model's face — emoji centered in a halo of their authored color,
// optionally framed by a soft ring. Pure visual, no layout opinions.
// Used in the chat gutter and anywhere else a face is needed.

import type { ModelState } from "../types";

interface AvatarProps {
  state: ModelState;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { container: "w-16 h-16", emoji: "text-4xl", ring: "inset-2" },
  md: { container: "w-20 h-20", emoji: "text-5xl", ring: "inset-2" },
  lg: { container: "w-28 h-28", emoji: "text-7xl", ring: "inset-3" },
};

export function Avatar({ state, size = "md" }: AvatarProps) {
  const { container, emoji, ring } = sizeMap[size];
  const haloStyle: React.CSSProperties = {
    background: `radial-gradient(circle at center, ${state.status_color}55 0%, ${state.status_color}22 35%, transparent 70%)`,
  };
  return (
    <div
      className={`relative ${container} flex items-center justify-center shrink-0`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 rounded-full" style={haloStyle} />
      <div
        className={`absolute ${ring} rounded-full border`}
        style={{ borderColor: `${state.status_color}33` }}
      />
      <span className={`relative ${emoji} leading-none select-none`}>
        {state.emoji}
      </span>
    </div>
  );
}
