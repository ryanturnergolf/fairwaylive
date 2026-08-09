"use client";

import type { DynamicStatisticReviewItem } from "../../../lib/services/dynamicStatisticsReviewService";

type Props = {
  items: DynamicStatisticReviewItem[];
  message?: string;
  overrideValues: Record<string, string>;
  isReadOnly: boolean;
  onOverrideValueChange: (itemId: string, value: string) => void;
  onResolve: (item: DynamicStatisticReviewItem, choice: "player" | "marker" | "coach_override") => void;
};

const formatValue = (value: DynamicStatisticReviewItem["playerValue"]) => {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const statusLabel: Record<DynamicStatisticReviewItem["status"], string> = {
  match: "Match",
  different: "Different",
  missing: "Missing",
  required_missing: "Required Missing",
};

export default function DynamicStatisticsReviewPanel({
  items,
  message = "",
  overrideValues,
  isReadOnly,
  onOverrideValueChange,
  onResolve,
}: Props) {
  if (items.length === 0) return null;

  return (
    <section className="mt-6 rounded-[28px] border border-[#7DA7BE] bg-[#F7FCFE] p-6 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.35em] text-[#255D78]">Dynamic Statistics Review</p>
          <h4 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">Player and Marker Values</h4>
        </div>
        <span className="rounded-full border border-[#7DA7BE] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#255D78]">Assigned Package</span>
      </div>
      {message ? <p className="mt-4 rounded-2xl border border-[#C8DCE7] bg-white px-4 py-3 text-sm font-bold text-[#51635C]">{message}</p> : null}
      <div className="mt-5 space-y-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-[20px] border border-[#C8DCE7] bg-white p-4">
            <div className="grid gap-4 lg:grid-cols-[1.4fr_repeat(4,minmax(90px,0.7fr))] lg:items-center">
              <div><p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#51635C]">{item.playerName} · Hole {item.holeNumber}</p><p className="mt-1 text-lg font-black text-[#0B3D2E]">{item.name}<span className="ml-2 text-xs text-[#B8892D]">{item.isRequired ? "Required" : "Optional"}</span></p></div>
              <div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">Player Value</p><p className="mt-1 font-black text-[#0B3D2E]">{formatValue(item.playerValue)}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">Marker Value</p><p className="mt-1 font-black text-[#0B3D2E]">{formatValue(item.markerValue)}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">Official Value</p><p className="mt-1 font-black text-[#0B3D2E]">{formatValue(item.officialValue)}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">Status</p><p className="mt-1 font-black text-[#255D78]">{statusLabel[item.status]}</p></div>
            </div>
            {item.playerEntry || item.markerEntry ? (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <button type="button" disabled={isReadOnly || !item.playerEntry} onClick={() => onResolve(item, "player")} className="h-10 rounded-full border border-[#0B3D2E] px-4 text-[10px] font-black uppercase tracking-[0.2em] text-[#0B3D2E] disabled:cursor-not-allowed disabled:opacity-40">Accept Player Value</button>
                <button type="button" disabled={isReadOnly || !item.markerEntry} onClick={() => onResolve(item, "marker")} className="h-10 rounded-full border border-[#0B3D2E] px-4 text-[10px] font-black uppercase tracking-[0.2em] text-[#0B3D2E] disabled:cursor-not-allowed disabled:opacity-40">Accept Marker Value</button>
                <label className="min-w-44 text-[10px] font-black uppercase tracking-[0.2em] text-[#51635C]">Corrected Official Value
                  {item.inputType === "option_list" ? (
                    <select value={overrideValues[item.id] ?? ""} onChange={(event) => onOverrideValueChange(item.id, event.target.value)} disabled={isReadOnly} className="mt-2 h-10 w-full rounded-full border border-[#C8DCE7] bg-[#FCFAF5] px-3 text-sm text-[#0B3D2E]"><option value="">Select</option>{item.configuration.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                  ) : item.inputType === "checkbox" || item.inputType === "yes_no" ? (
                    <select value={overrideValues[item.id] ?? ""} onChange={(event) => onOverrideValueChange(item.id, event.target.value)} disabled={isReadOnly} className="mt-2 h-10 w-full rounded-full border border-[#C8DCE7] bg-[#FCFAF5] px-3 text-sm text-[#0B3D2E]"><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select>
                  ) : (
                    <input type="number" min={item.configuration.minimum} max={item.configuration.maximum} value={overrideValues[item.id] ?? ""} onChange={(event) => onOverrideValueChange(item.id, event.target.value)} disabled={isReadOnly} className="mt-2 h-10 w-full rounded-full border border-[#C8DCE7] bg-[#FCFAF5] px-3 text-sm text-[#0B3D2E]" />
                  )}
                </label>
                <button type="button" disabled={isReadOnly || !(overrideValues[item.id] ?? "")} onClick={() => onResolve(item, "coach_override")} className="h-10 rounded-full bg-[#0B3D2E] px-4 text-[10px] font-black uppercase tracking-[0.2em] text-white disabled:cursor-not-allowed disabled:opacity-40">{item.officialEntry ? "Correct Official Value" : "Enter Official Value"}</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
