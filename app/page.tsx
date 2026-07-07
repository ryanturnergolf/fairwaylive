"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadSharedTournamentAggregates, type TournamentAggregate } from "./lib/services/tournamentService";
import { loadTournamentsFromStorage, type StoredTournament } from "./lib/tournamentStorage";

const teams = [
  {
    pos: "1",
    name: "Bluffton University",
    short: "BU",
    toPar: "-8",
    thru: "14-17",
    today: "-8",
    status: "On the green",
    update: "2m ago",
    players: "14 players",
    hole: "14/18",
  },
  {
    pos: "2",
    name: "Ohio Northern University",
    short: "ONU",
    toPar: "-5",
    thru: "13-17",
    today: "-5",
    status: "Approach",
    update: "4m ago",
    players: "13 players",
    hole: "13/18",
  },
  {
    pos: "3",
    name: "Heidelberg University",
    short: "HU",
    toPar: "-2",
    thru: "12-16",
    today: "-2",
    status: "Fairway",
    update: "6m ago",
    players: "12 players",
    hole: "12/18",
  },
  {
    pos: "4",
    name: "Defiance College",
    short: "DC",
    toPar: "+1",
    thru: "11-15",
    today: "+1",
    status: "Bunker",
    update: "8m ago",
    players: "11 players",
    hole: "11/18",
  },
  {
    pos: "5",
    name: "Luther College",
    short: "LC",
    toPar: "+3",
    thru: "11-17",
    today: "+3",
    status: "Tee box",
    update: "10m ago",
    players: "11 players",
    hole: "11/18",
  },
];

const programBadges = ["NCAA DI", "NCAA DII", "NCAA DIII", "NAIA", "NJCAA"];
const trustSchools = ["Duke", "UNC", "Auburn", "USC", "GT"];

const stats = [
  ["18", "Live Tournaments"],
  ["2,341", "Players"],
  ["182", "Teams"],
  ["24/7", "Updates"],
];

const features = [
  {
    title: "Live Scoring",
    text: "Capture every stroke from the course and broadcast instant leaderboards to players, coaches, and fans.",
  },
  {
    title: "Tournament Management",
    text: "Launch polished events with tee times, pairings, course notes, and real-time score updates in one flow.",
  },
  {
    title: "Team Management",
    text: "Keep rosters, schedules, stats, and communication neatly organized so your program runs at its best.",
  },
];

const mergeTournamentsById = (localTournaments: StoredTournament[], sharedAggregates: TournamentAggregate[]) => {
  const tournamentsById = new Map<string, StoredTournament>();

  sharedAggregates.forEach((aggregate) => {
    const tournament = aggregate.tournament;
    tournamentsById.set(tournament.id, tournament);
  });
  localTournaments.forEach((tournament) => {
    tournamentsById.set(tournament.id, tournament);
  });

  return Array.from(tournamentsById.values());
};

export default function Home() {
  const [savedTournaments, setSavedTournaments] = useState<StoredTournament[]>([]);

  useEffect(() => {
    let isCancelled = false;
    const localTournaments = loadTournamentsFromStorage();
    setSavedTournaments(localTournaments);

    void loadSharedTournamentAggregates()
      .then((sharedAggregates) => {
        if (!isCancelled) {
          setSavedTournaments(mergeTournamentsById(localTournaments, sharedAggregates));
        }
      })
      .catch((error) => {
        console.warn("[TournamentService] Unable to load shared tournament aggregates.", error);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8 lg:py-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#B8892D]/30 bg-[#0B3D2E] text-sm font-black tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15">
            HQ
          </div>
          <div>
            <h1 className="text-lg font-black tracking-[-0.02em]">Clubhouse HQ</h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#B8892D]">
              College Golf Operations
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#0B3D2E]/75 md:flex">
          <Link className="transition duration-300 hover:text-[#B8892D]" href="/live">
            Live Scores
          </Link>
          <a className="transition duration-300 hover:text-[#B8892D]" href="#">
            Tournaments
          </a>
          <a className="transition duration-300 hover:text-[#B8892D]" href="#">
            Features
          </a>
          <a className="transition duration-300 hover:text-[#B8892D]" href="#">
            Pricing
          </a>
          <Link className="transition duration-300 hover:text-[#B8892D]" href="/dashboard">
            Dashboard
          </Link>
          <a className="transition duration-300 hover:text-[#B8892D]" href="#">
            Login
          </a>
          <a className="rounded-full bg-[#0B3D2E] px-4 py-2.5 text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5" href="#">
            Get Started
          </a>
        </nav>
      </header>

      <section className="relative isolate overflow-hidden px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[40px] border border-[#E8DCC8] bg-[#0B3D2E] shadow-[0_40px_120px_rgba(11,61,46,0.18)]">
          <div className="relative min-h-[720px] lg:min-h-[780px]">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage:
                  "url('https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&w=1800&q=80')",
              }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(11,61,46,0.95)_0%,rgba(11,61,46,0.82)_35%,rgba(11,61,46,0.45)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(240,201,106,0.18),transparent_32%)]" />

            <div className="relative grid min-h-[720px] items-center gap-10 px-6 py-14 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:px-12 lg:py-20">
              <div className="max-w-2xl text-[#F6F1E6]">
                <p className="mb-5 text-sm font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                  Premium scoring infrastructure for modern programs
                </p>
                <h2 className="text-5xl font-black leading-[0.92] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                  The operating system for college golf.
                </h2>
                <p className="mt-6 max-w-xl text-lg leading-8 text-[#F6F1E6]/80 sm:text-xl">
                  Everything you need to run tournaments, manage your team, track live scoring, and keep coaches, players, and fans connected.
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                  {programBadges.map((badge) => (
                    <span key={badge} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#F6F1E6]/80">
                      {badge}
                    </span>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-3 text-sm text-[#F6F1E6]/80 backdrop-blur">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#F0C96A]">
                    Trusted by college golf coaches across America
                  </span>
                  <div className="flex items-center gap-2">
                    {trustSchools.map((school) => (
                      <div key={school} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-[#F6F1E6] text-[10px] font-black uppercase tracking-[0.2em] text-[#0B3D2E]">
                        {school}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a className="rounded-full bg-[#F6F1E6] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] shadow-xl shadow-black/10 transition duration-300 hover:-translate-y-1" href="#">
                    View Live Scores
                  </a>
                  <a className="rounded-full border border-[#F0C96A]/60 px-7 py-4 text-center text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] transition duration-300 hover:bg-[#F0C96A]/10" href="#">
                    Host a Tournament
                  </a>
                </div>
              </div>

              <div className="relative flex justify-end lg:justify-center">
                <div className="w-full max-w-[470px] rounded-[32px] border border-white/15 bg-[#F6F1E6]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                  <div className="flex items-center justify-between rounded-[24px] bg-[#0B3D2E] px-4 py-3 text-[#F6F1E6]">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                        Live Now
                      </p>
                      <h3 className="mt-1 text-xl font-black">College Invitational</h3>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em]">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[#F0C96A]" />
                      <span>LIVE</span>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[24px] border border-[#E8DCC8] bg-white/80 p-4 shadow-inner backdrop-blur">
                    <div className="mb-4 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.3em] text-[#6F7C74]">
                      <span>Leaderboard</span>
                      <span>Glen Oaks</span>
                    </div>
                    <div className="mb-3 grid grid-cols-3 gap-2 rounded-[18px] border border-[#E8DCC8] bg-[#F6F1E6] p-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                      <div>14 players</div>
                      <div>14/18 holes</div>
                      <div>Last update 2m</div>
                    </div>
                    <div className="space-y-2.5">
                      {teams.map((team, index) => (
                        <div
                          key={team.name}
                          className={`flex items-center justify-between rounded-2xl px-3 py-3 transition duration-300 hover:-translate-y-0.5 ${index === 0 ? "bg-[#0B3D2E] text-[#F6F1E6]" : "bg-[#F6F1E6] text-[#0B3D2E]"}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${index === 0 ? "bg-[#F0C96A] text-[#0B3D2E]" : "bg-[#0B3D2E] text-[#F6F1E6]"}`}>
                              {team.short}
                            </span>
                            <div>
                              <p className="text-sm font-black">{team.name}</p>
                              <p className={`text-[10px] uppercase tracking-[0.25em] ${index === 0 ? "text-[#F0C96A]" : "text-[#6F7C74]"}`}>
                                {team.status} • {team.update}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-black ${index === 0 ? "text-[#F0C96A]" : "text-[#B8892D]"}`}>
                              {team.toPar}
                            </p>
                            <p className={`text-[10px] uppercase tracking-[0.25em] ${index === 0 ? "text-[#F0C96A]/80" : "text-[#6F7C74]"}`}>
                              {team.thru}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#0B3D2E] py-9 text-[#F6F1E6]">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-4 md:px-8">
          {stats.map(([value, label]) => (
            <div key={label} className="rounded-[24px] border border-white/10 bg-white/10 px-5 py-5 text-center backdrop-blur-xl">
              <p className="text-3xl font-black text-[#F0C96A]">{value}</p>
              <p className="mt-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#F6F1E6]/80">
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
        <div className="rounded-[36px] border border-[#E8DCC8] bg-white/90 p-8 shadow-[0_24px_80px_rgba(11,61,46,0.08)] backdrop-blur lg:p-10">
          <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                Saved Tournaments
              </p>
              <h3 className="mt-2 text-3xl font-black tracking-[-0.02em]">
                Open any tournament already created in Clubhouse HQ.
              </h3>
            </div>
            <Link className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] transition duration-300 hover:-translate-y-0.5" href="/dashboard">
              Open Dashboard
            </Link>
          </div>

          {savedTournaments.length === 0 ? (
            <div className="rounded-[24px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 text-center text-[#51635C] shadow-inner">
              Create a tournament from the dashboard and it will appear here automatically.
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {savedTournaments.map((tournament) => (
                <div key={tournament.id} className="rounded-[32px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                        {tournament.status}
                      </p>
                      <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                        {tournament.name}
                      </h3>
                    </div>
                    <span className="rounded-full border border-[#E8DCC8] bg-[#F6F1E6] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">
                      {tournament.rounds} Rounds
                    </span>
                  </div>

                  <div className="mt-6 space-y-3 text-sm text-[#51635C]">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold uppercase tracking-[0.25em]">Course</span>
                      <span className="text-right font-black text-[#0B3D2E]">{tournament.course || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold uppercase tracking-[0.25em]">Date</span>
                      <span className="text-right font-black text-[#0B3D2E]">{tournament.date || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold uppercase tracking-[0.25em]">Status</span>
                      <span className="text-right font-black text-[#0B3D2E]">{tournament.status}</span>
                    </div>
                  </div>

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Link
                      href={`/tournament/${tournament.id}`}
                      className="rounded-full bg-[#0B3D2E] px-6 py-3 text-center text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                    >
                      Open Tournament
                    </Link>
                    <Link
                      href="/dashboard"
                      className="rounded-full border border-[#B8892D] px-6 py-3 text-center text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                    >
                      Manage
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-24 md:grid-cols-3 lg:px-8">
        {features.map((feature) => (
          <div key={feature.title} className="rounded-[30px] border border-[#E8DCC8] bg-white/90 p-8 shadow-[0_18px_45px_rgba(11,61,46,0.06)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(11,61,46,0.12)]">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#0B3D2E] text-xl font-black text-[#F0C96A]">
              HQ
            </div>
            <h3 className="text-xl font-black uppercase tracking-[0.2em]">{feature.title}</h3>
            <p className="mt-4 leading-7 text-[#51635C]">{feature.text}</p>
            <p className="mt-6 text-sm font-black uppercase tracking-[0.25em] text-[#B8892D]">
              Learn More →
            </p>
          </div>
        ))}
      </section>

      <footer className="bg-[#0B3D2E] px-6 py-10 text-[#F6F1E6] lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h3 className="text-2xl font-black">Clubhouse HQ</h3>
            <p className="mt-1 text-sm uppercase tracking-[0.35em] text-[#F0C96A]">
              College Golf Operations
            </p>
          </div>
          <p className="text-sm text-white/70">
            © 2026 Clubhouse HQ. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
