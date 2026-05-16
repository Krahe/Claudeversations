// Human side. Same two-column grid as ModelBlock so content lines up
// vertically across speakers. The gutter holds a small "you" tag
// instead of an avatar — present but unobtrusive.

interface HumanTurnProps {
  text: string;
}

export function HumanTurn({ text }: HumanTurnProps) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-5 my-7">
      <div className="flex justify-center pt-2">
        <span
          className="text-xs uppercase tracking-widest text-ink-dim"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          you
        </span>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed pt-1">{text}</p>
    </div>
  );
}
