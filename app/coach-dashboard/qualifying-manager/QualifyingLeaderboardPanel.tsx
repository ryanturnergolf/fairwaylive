"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MultiRoundTournamentLeaderboard from "../../components/leaderboards/MultiRoundTournamentLeaderboard";
import { useVisibilityAwarePolling } from "../../lib/hooks/useVisibilityAwarePolling";
import { createShareToken, resolveShareToken } from "../../lib/services/shareTokenService";
import {
  loadShareTokenLeaderboard,
  type ShareTokenLeaderboardReadModel,
} from "../../lib/services/shareTokenLeaderboardService";

const leaderboardTokenStorageKey = (tournamentId: string) =>
  `clubhouse-hq:live-leaderboard-token:v1:${tournamentId}`;

export const buildPublicLeaderboardUrl = (origin: string, shareToken: string) =>
  `${origin}/leaderboard?${new URLSearchParams({ shareToken }).toString()}`;

export const getOrCreateLeaderboardToken = async (tournamentId: string) => {
  const storageKey = leaderboardTokenStorageKey(tournamentId);
  const cachedToken = window.localStorage.getItem(storageKey) ?? "";
  if (cachedToken) {
    const resolution = await resolveShareToken(cachedToken).catch(() => null);
    if (
      resolution?.tournamentId === tournamentId &&
      resolution.purpose === "live_leaderboard" &&
      new Date(resolution.expiresAt).getTime() > Date.now()
    ) {
      return cachedToken;
    }
    window.localStorage.removeItem(storageKey);
  }

  const created = await createShareToken(tournamentId, "live_leaderboard");
  const token = created.token ?? "";
  if (!token) throw new Error("The public leaderboard link could not be created.");
  window.localStorage.setItem(storageKey, token);
  return token;
};

export default function QualifyingLeaderboardPanel({
  tournamentId,
  sessionName,
  isVisible,
}: {
  tournamentId: string;
  sessionName: string;
  isVisible: boolean;
}) {
  const [shareToken, setShareToken] = useState("");
  const [model, setModel] = useState<ShareTokenLeaderboardReadModel | null>(null);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const requestSequence = useRef(0);

  useEffect(() => {
    if (!isVisible || !tournamentId) return;
    let cancelled = false;
    setError("");
    setIsLoading(true);
    void getOrCreateLeaderboardToken(tournamentId)
      .then((token) => {
        if (!cancelled) setShareToken(token);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to prepare the public leaderboard.");
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [isVisible, tournamentId]);

  const refresh = useCallback(async () => {
    if (!shareToken || !isVisible) return;
    const requestId = ++requestSequence.current;
    try {
      const next = await loadShareTokenLeaderboard({ tournamentId, roundNumber: 1, shareToken });
      if (!next) throw new Error("The public leaderboard is unavailable.");
      if (requestId === requestSequence.current) {
        setModel(next);
        setError("");
      }
    } catch (cause) {
      if (requestId === requestSequence.current) {
        setError(cause instanceof Error ? cause.message : "Unable to load the public leaderboard.");
      }
    } finally {
      if (requestId === requestSequence.current) setIsLoading(false);
    }
  }, [isVisible, shareToken, tournamentId]);

  useEffect(() => {
    if (shareToken && isVisible) void refresh();
  }, [isVisible, refresh, shareToken]);

  const hasActiveScoring = Boolean(model?.individualLeaderboard.some((row) =>
    row.through !== "Not started" && row.through !== "F"
  ));
  useVisibilityAwarePolling({
    enabled: Boolean(isVisible && shareToken && !model?.isFinalized),
    intervalMs: hasActiveScoring ? 10_000 : 30_000,
    poll: refresh,
    refreshImmediately: false,
  });

  const publicUrl = shareToken && typeof window !== "undefined"
    ? buildPublicLeaderboardUrl(window.location.origin, shareToken)
    : "";
  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyMessage("Leaderboard link copied.");
    } catch {
      setCopyMessage("Copy failed. Open the public leaderboard and copy its address.");
    }
  };

  return (
    <section aria-label="Qualifying public leaderboard" className="rounded-2xl border border-[#E8DCC8] bg-white p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#B8892D]">Public Leaderboard</p>
          <h3 className="mt-1 text-xl font-black">{sessionName}</h3>
          <p className="mt-1 text-sm font-semibold text-[#51635C]">The same live, round-aware view shared with players and families.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void copyLink()} disabled={!publicUrl} className="min-h-11 rounded-full bg-[#0B3D2E] px-4 py-2 text-xs font-black text-white disabled:opacity-50">
            Copy Leaderboard Link
          </button>
          {publicUrl ? <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-[#0B3D2E] px-4 py-2 text-xs font-black">View Public Leaderboard</a> : null}
        </div>
      </div>
      {copyMessage ? <p role="status" className="mt-3 text-sm font-semibold text-[#51635C]">{copyMessage}</p> : null}
      {isLoading ? <p role="status" className="mt-5 rounded-xl bg-[#F6F1E6] p-4 font-semibold">Loading public leaderboard…</p> : null}
      {error ? <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</p> : null}
      {model?.multiRoundProjection ? (
        <div className="mt-5">
          <MultiRoundTournamentLeaderboard projection={model.multiRoundProjection} eventId={model.tournamentId} publicSurface />
        </div>
      ) : model ? (
        <div className="mt-5 space-y-2">
          {model.individualLeaderboard.map((row) => (
            <div key={row.playerName} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-sm">
              <span className="truncate font-black">{row.playerName}</span>
              <span className="font-black">{row.totalScore || "—"}</span>
              <span className="font-semibold text-[#51635C]">{row.through}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
