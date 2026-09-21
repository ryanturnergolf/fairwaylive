"use client";

import { useEffect, useRef } from "react";

type VisibilityAwarePollingOptions = {
  enabled: boolean;
  intervalMs: number;
  poll: () => void | Promise<void>;
  refreshImmediately?: boolean;
};

/**
 * Owns one non-overlapping polling loop for a visible browser tab. Returning
 * to the tab refreshes immediately and starts a fresh cadence.
 */
export const useVisibilityAwarePolling = ({
  enabled,
  intervalMs,
  poll,
  refreshImmediately = true,
}: VisibilityAwarePollingOptions) => {
  const pollRef = useRef(poll);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    if (!enabled) return;

    let intervalId: number | null = null;
    let isCancelled = false;
    let isInFlight = false;

    const clearPollingInterval = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const refresh = async () => {
      if (isCancelled || document.visibilityState !== "visible" || isInFlight) return;
      isInFlight = true;
      try {
        await pollRef.current();
      } finally {
        isInFlight = false;
      }
    };

    const startPolling = ({ refreshNow }: { refreshNow: boolean }) => {
      clearPollingInterval();
      if (document.visibilityState !== "visible") return;
      if (refreshNow) void refresh();
      intervalId = window.setInterval(() => void refresh(), intervalMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startPolling({ refreshNow: true });
      } else {
        clearPollingInterval();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    startPolling({ refreshNow: refreshImmediately });

    return () => {
      isCancelled = true;
      clearPollingInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, intervalMs, refreshImmediately]);
};
