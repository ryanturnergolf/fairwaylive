"use client";

export type GolfScoreKind = "eagle" | "birdie" | "par" | "bogey" | "double-bogey" | "unplayed";

export const getGolfScoreKind = (score: number | null, par: number | null): GolfScoreKind => {
  if (score === null) return "unplayed";
  if (par === null) return "par";
  const relative = score - par;
  if (relative <= -2) return "eagle";
  if (relative === -1) return "birdie";
  if (relative === 0) return "par";
  if (relative === 1) return "bogey";
  return "double-bogey";
};

const labels: Record<Exclude<GolfScoreKind, "unplayed">, string> = {
  eagle: "eagle or better",
  birdie: "birdie",
  par: "par",
  bogey: "bogey",
  "double-bogey": "double bogey or worse",
};

export default function GolfScoreCell({ score, par }: { score: number | null; par: number | null }) {
  const kind = getGolfScoreKind(score, par);
  if (kind === "unplayed") return <span aria-label="Not played">&mdash;</span>;
  const shape = kind === "birdie"
    ? "rounded-full border-2 border-[#B8892D]"
    : kind === "eagle"
      ? "rounded-full border-4 border-double border-[#B8892D]"
      : kind === "bogey"
        ? "border-2 border-[#0B3D2E]"
        : kind === "double-bogey"
          ? "border-4 border-double border-[#0B3D2E]"
          : "";
  return <span className={`inline-flex h-8 w-8 items-center justify-center font-black leading-none ${shape}`} aria-label={`${score}, ${labels[kind]}`} data-score-kind={kind}>{score}</span>;
}
