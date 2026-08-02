"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { coachSessionExpiredMessage, getSupabaseBrowserClient } from "../lib/supabaseClient";

function CoachAuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [message, setMessage] = useState(() =>
    searchParams.get("reason") === "session-expired" ? coachSessionExpiredMessage : ""
  );
  const [pending, setPending] = useState(false);
  const [sessionCheckComplete, setSessionCheckComplete] = useState(false);
  const nextPath = (() => {
    const requestedPath = searchParams.get("next");
    return requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : "/dashboard";
  })();

  useEffect(() => {
    let isCancelled = false;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSessionCheckComplete(true);
      return;
    }

    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (isCancelled) return;
      if (!error && data.user && !data.user.is_anonymous) {
        router.replace(nextPath);
        return;
      }
      if (error) {
        await supabase.auth.signOut({ scope: "local" });
      }
      if (!isCancelled) setSessionCheckComplete(true);
    });

    return () => {
      isCancelled = true;
    };
  }, [nextPath, router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase is not configured.");
      setPending(false);
      return;
    }

    const result = mode === "sign-in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { display_name: email.split("@")[0] } } });

    if (result.error) {
      setMessage(result.error.message);
    } else if (!result.data.session) {
      setMessage("Check your email to confirm the account, then sign in.");
    } else {
      router.replace(nextPath);
      router.refresh();
    }
    setPending(false);
  };

  if (!sessionCheckComplete) {
    return <main aria-label="Checking coach session" className="min-h-screen bg-[#F6F1E6]" />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F1E6] px-6 py-12 text-[#0B3D2E]">
      <section className="w-full max-w-md rounded-3xl border border-[#D8C9AE] bg-white p-8 shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-[#B8892D]">Clubhouse HQ</p>
        <h1 className="mt-3 text-3xl font-black">Coach {mode === "sign-in" ? "Sign In" : "Account"}</h1>
        <p className="mt-2 text-sm text-[#4D625B]">Use your verified coach account to manage and synchronize tournaments.</p>
        <form className="mt-8 space-y-5" onSubmit={submit}>
          <label className="block text-sm font-bold">Email
            <input className="mt-2 w-full rounded-xl border border-[#C9B997] px-4 py-3" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block text-sm font-bold">Password
            <input className="mt-2 w-full rounded-xl border border-[#C9B997] px-4 py-3" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {message ? <p role="status" className="rounded-xl bg-[#F6F1E6] p-3 text-sm">{message}</p> : null}
          <button className="w-full rounded-full bg-[#0B3D2E] px-6 py-3 font-black text-[#F6F1E6] disabled:opacity-60" disabled={pending} type="submit">
            {pending ? "Please wait..." : mode === "sign-in" ? "Sign In" : "Create Coach Account"}
          </button>
        </form>
        <button className="mt-5 w-full text-sm font-bold text-[#7A5A20]" type="button" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage(""); }}>
          {mode === "sign-in" ? "Create a coach account" : "Already have an account? Sign in"}
        </button>
        <Link className="mt-5 block text-center text-sm" href="/">Return home</Link>
      </section>
    </main>
  );
}

export default function CoachAuthPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#F6F1E6]" />}>
      <CoachAuthForm />
    </Suspense>
  );
}
