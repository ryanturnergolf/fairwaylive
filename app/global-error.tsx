"use client";

import { useEffect } from "react";
import { reportClientError } from "./lib/services/clientMonitoringService";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    void reportClientError({
      source: "client",
      name: error.name,
      message: error.message,
      route: window.location.pathname,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#F6F1E6", color: "#0B3D2E", fontFamily: "sans-serif" }}>
        <main style={{ margin: "0 auto", maxWidth: 640, padding: "4rem 1.5rem", textAlign: "center" }}>
          <h1>Clubhouse HQ encountered an unexpected error.</h1>
          <p>Your scoring data has not been intentionally changed. Retry, then contact the tournament director if the issue continues.</p>
          <button type="button" onClick={unstable_retry} style={{ minHeight: 48, padding: "0.75rem 1.5rem" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
