"use client";

export type GolfScorecardHole = { holeNumber: number; par: number | null; score: number | null };

const total = (holes: GolfScorecardHole[], field: "par" | "score") =>
  holes.reduce((sum, hole) => sum + (hole[field] ?? 0), 0);

export default function GolfScorecardGrid({ holes, label }: { holes: GolfScorecardHole[]; label: string }) {
  const played = holes.filter((hole) => hole.score !== null);
  if (played.length === 0) return <p className="rounded-xl bg-[#F6F1E6] p-4 text-sm font-bold text-[#51635C]">Not started</p>;
  const naturalOutIn = holes.length === 18 && holes.slice(0, 9).every((hole, index) => hole.holeNumber === index + 1);
  const groups = naturalOutIn ? [holes.slice(0, 9), holes.slice(9)] : [holes];
  return (
    <div className="max-w-full overflow-x-auto rounded-xl border border-[#E8DCC8]" aria-label={label} tabIndex={0}>
      <table className="min-w-max border-collapse text-center text-xs">
        <tbody>
          {groups.map((group, groupIndex) => (
            <tr key={`group-${groupIndex}`} className="border-t border-[#E8DCC8] first:border-t-0">
              <th className="sticky left-0 z-10 min-w-20 bg-[#F6F1E6] px-3 py-3 text-left font-black">{groupIndex === 0 ? "Hole" : "Hole"}</th>
              {group.map((hole) => <th key={hole.holeNumber} className="min-w-11 bg-[#F6F1E6] px-2 py-3 font-black">{hole.holeNumber}</th>)}
              <th className="min-w-16 bg-[#F6F1E6] px-3 py-3 font-black">{naturalOutIn ? (groupIndex === 0 ? "Out" : "In") : "Total"}</th>
            </tr>
          )).flatMap((heading, index) => [
            heading,
            <tr key={`par-${index}`} className="border-t border-[#E8DCC8]">
              <th className="sticky left-0 z-10 bg-white px-3 py-3 text-left font-black">Par</th>
              {groups[index].map((hole) => <td key={hole.holeNumber} className="px-2 py-3">{hole.par ?? "—"}</td>)}
              <td className="px-3 py-3 font-black">{groups[index].every((hole) => hole.par !== null) ? total(groups[index], "par") : "—"}</td>
            </tr>,
            <tr key={`score-${index}`} className="border-t border-[#E8DCC8]">
              <th className="sticky left-0 z-10 bg-white px-3 py-3 text-left font-black">Score</th>
              {groups[index].map((hole) => <td key={hole.holeNumber} className="px-2 py-3 font-black text-[#0B3D2E]">{hole.score ?? "—"}</td>)}
              <td className="px-3 py-3 font-black text-[#0B3D2E]">{total(groups[index], "score") || "—"}</td>
            </tr>,
          ])}
          {naturalOutIn ? (
            <tr className="border-t border-[#E8DCC8] bg-[#FCFAF5]">
              <th className="sticky left-0 z-10 bg-[#FCFAF5] px-3 py-3 text-left font-black">Round</th>
              <td colSpan={18} className="px-3 py-3 text-right font-black">Total {total(holes, "score")}</td>
              <td className="px-3 py-3 font-black">{played.length === holes.length ? "F" : `${played.length}/${holes.length}`}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
