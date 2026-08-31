"use client";

export type LeaderboardRoundOption = {
  id: string;
  roundNumber: number;
  label?: string;
};

export default function RoundSelector({
  rounds,
  selectedRoundId,
  onSelect,
  label = "Leaderboard round",
}: {
  rounds: LeaderboardRoundOption[];
  selectedRoundId: string;
  onSelect: (roundId: string) => void;
  label?: string;
}) {
  if (rounds.length <= 1) return null;
  return (
    <div className="max-w-full overflow-x-auto pb-1" aria-label={label}>
      <div className="flex min-w-max gap-2" role="tablist" aria-label={label}>
        {[...rounds].sort((a, b) => a.roundNumber - b.roundNumber).map((round) => (
          <button
            key={round.id}
            type="button"
            role="tab"
            aria-selected={round.id === selectedRoundId}
            onClick={() => onSelect(round.id)}
            className={`min-h-12 min-w-12 rounded-full border px-4 text-xs font-black transition ${
              round.id === selectedRoundId
                ? "border-[#0B3D2E] bg-[#0B3D2E] text-white"
                : "border-[#D9D0C0] bg-white text-[#0B3D2E] hover:border-[#B8892D]"
            }`}
          >
            {round.label ?? `R${round.roundNumber}`}
          </button>
        ))}
      </div>
    </div>
  );
}
