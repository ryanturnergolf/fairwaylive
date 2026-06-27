"use client";

import Link from "next/link";
import { useState } from "react";

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
  },
  {
    pos: "6",
    name: "North Central College",
    short: "NCC",
    toPar: "+4",
    thru: "11-16",
    today: "+4",
    status: "Tee box",
    update: "12m ago",
  },
  {
    pos: "7",
    name: "Wheaton College",
    short: "WC",
    toPar: "+5",
    thru: "10-15",
    today: "+5",
    status: "Approach",
    update: "14m ago",
  },
  {
    pos: "8",
    name: "Hope College",
    short: "HC",
    toPar: "+6",
    thru: "10-14",
    today: "+6",
    status: "Fairway",
    update: "16m ago",
  },
  {
    pos: "9",
    name: "Saint Mary's University",
    short: "SMU",
    toPar: "+7",
    thru: "9-13",
    today: "+7",
    status: "Bunker",
    update: "18m ago",
  },
  {
    pos: "10",
    name: "Trine University",
    short: "TU",
    toPar: "+8",
    thru: "9-12",
    today: "+8",
    status: "Fairway",
    update: "20m ago",
  },
  {
    pos: "11",
    name: "Concordia University",
    short: "CU",
    toPar: "+9",
    thru: "8-11",
    today: "+9",
    status: "Approach",
    update: "22m ago",
  },
  {
    pos: "12",
    name: "Albion College",
    short: "AC",
    toPar: "+10",
    thru: "8-10",
    today: "+10",
    status: "Tee box",
    update: "24m ago",
  },
];

const players = [
  { pos: "1", name: "Miles Carter", school: "Bluffton University", toPar: "-6", thru: "14" },
  { pos: "2", name: "Ethan Brooks", school: "Ohio Northern University", toPar: "-4", thru: "13" },
  { pos: "3", name: "Tyler Grant", school: "Heidelberg University", toPar: "-3", thru: "12" },
  { pos: "4", name: "Caleb Morris", school: "Defiance College", toPar: "-2", thru: "11" },
  { pos: "5", name: "Dylan Hart", school: "Luther College", toPar: "-1", thru: "11" },
  { pos: "6", name: "Noah Pierce", school: "North Central College", toPar: "E", thru: "11" },
  { pos: "7", name: "Landon Vale", school: "Wheaton College", toPar: "+1", thru: "10" },
  { pos: "8", name: "Jace Reynolds", school: "Hope College", toPar: "+2", thru: "10" },
  { pos: "9", name: "Owen Shaw", school: "Saint Mary's University", toPar: "+3", thru: "9" },
  { pos: "10", name: "Adrian Cole", school: "Trine University", toPar: "+4", thru: "9" },
  { pos: "11", name: "Mason Bennett", school: "Concordia University", toPar: "+5", thru: "8" },
  { pos: "12", name: "Kade Ellison", school: "Albion College", toPar: "+6", thru: "8" },
  { pos: "13", name: "Tate Nolan", school: "Bluffton University", toPar: "+7", thru: "14" },
  { pos: "14", name: "Grant Weller", school: "Ohio Northern University", toPar: "+8", thru: "13" },
  { pos: "15", name: "Samuel Page", school: "Heidelberg University", toPar: "+8", thru: "12" },
  { pos: "16", name: "Carter Hughes", school: "Defiance College", toPar: "+9", thru: "11" },
  { pos: "17", name: "Brady Lowe", school: "Luther College", toPar: "+9", thru: "11" },
  { pos: "18", name: "Hunter Dean", school: "North Central College", toPar: "+10", thru: "11" },
  { pos: "19", name: "Isaac Ford", school: "Wheaton College", toPar: "+11", thru: "10" },
  { pos: "20", name: "Leo Martin", school: "Hope College", toPar: "+12", thru: "10" },
  { pos: "21", name: "Nate Flores", school: "Saint Mary's University", toPar: "+12", thru: "9" },
  { pos: "22", name: "Colin Price", school: "Trine University", toPar: "+13", thru: "9" },
  { pos: "23", name: "Riley Stone", school: "Concordia University", toPar: "+14", thru: "8" },
  { pos: "24", name: "Parker Quinn", school: "Albion College", toPar: "+15", thru: "8" },
  { pos: "25", name: "Eli Thomas", school: "Bluffton University", toPar: "+16", thru: "14" },
];

export default function LivePage() {
  const [view, setView] = useState<"team" | "individual">("team");

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
          <a className="transition duration-300 hover:text-[#B8892D]" href="#">
            Login
          </a>
          <a className="rounded-full bg-[#0B3D2E] px-4 py-2.5 text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5" href="#">
            Get Started
          </a>
        </nav>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8 lg:px-8 lg:py-10">
        <div className="rounded-[36px] border border-[#E8DCC8] bg-white/90 p-8 shadow-[0_24px_80px_rgba(11,61,46,0.08)] backdrop-blur lg:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                Live Tournament
              </p>
              <h2 className="mt-2 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
                Buckeye College Invitational
              </h2>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#51635C]">
                <span className="rounded-full border border-[#E8DCC8] bg-[#F6F1E6] px-3 py-1.5 font-semibold uppercase tracking-[0.25em]">
                  Glen Oaks Country Club
                </span>
                <span className="rounded-full border border-[#E8DCC8] bg-[#F6F1E6] px-3 py-1.5 font-semibold uppercase tracking-[0.25em]">
                  Round 1 of 3
                </span>
                <span className="rounded-full border border-[#E8DCC8] bg-[#F6F1E6] px-3 py-1.5 font-semibold uppercase tracking-[0.25em]">
                  Weather: 74°F Sunny
                </span>
              </div>
            </div>

            <div className="rounded-[24px] border border-[#E8DCC8] bg-[#F6F1E6] px-5 py-4 text-sm text-[#51635C] shadow-inner">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                Last Updated
              </p>
              <p className="mt-1 font-black text-[#0B3D2E]">Just Now</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3 rounded-[24px] border border-[#E8DCC8] bg-[#FCFAF5] p-3">
            <button
              className={`rounded-full px-5 py-2.5 text-sm font-black uppercase tracking-[0.25em] transition duration-300 ${view === "team" ? "bg-[#0B3D2E] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15" : "text-[#51635C] hover:bg-white"}`}
              onClick={() => setView("team")}
            >
              Team
            </button>
            <button
              className={`rounded-full px-5 py-2.5 text-sm font-black uppercase tracking-[0.25em] transition duration-300 ${view === "individual" ? "bg-[#0B3D2E] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15" : "text-[#51635C] hover:bg-white"}`}
              onClick={() => setView("individual")}
            >
              Individual
            </button>
          </div>

          <div className="mt-8 overflow-hidden rounded-[24px] border border-[#E8DCC8] bg-[#FCFAF5]">
            <div className={`transition-all duration-300 ${view === "team" ? "opacity-100" : "hidden opacity-0"}`}>
              <div className="grid grid-cols-[70px_1fr_90px_90px_90px] bg-[#F6F1E6] px-5 py-4 text-[11px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                <div>Position</div>
                <div>Team</div>
                <div>To Par</div>
                <div>Through</div>
                <div>Today</div>
              </div>

              {teams.map((team, index) => (
                <div key={team.name} className={`grid grid-cols-[70px_1fr_90px_90px_90px] items-center border-t border-[#E8DCC8] px-5 py-5 text-sm transition duration-300 hover:-translate-y-0.5 hover:bg-white ${index === 0 ? "bg-[#FFFDF7]" : "bg-transparent"}`}>
                  <div className="font-semibold">{team.pos}</div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0B3D2E] text-[10px] font-black uppercase tracking-[0.2em] text-[#F6F1E6]">
                      {team.short}
                    </div>
                    <div>
                      <div className="font-black">{team.name}</div>
                      <div className="text-[10px] uppercase tracking-[0.25em] text-[#6F7C74]">
                        {team.status} • {team.update}
                      </div>
                    </div>
                  </div>
                  <div className="font-black text-[#B8892D]">{team.toPar}</div>
                  <div>{team.thru}</div>
                  <div className="font-black text-[#0B3D2E]">{team.today}</div>
                </div>
              ))}
            </div>

            <div className={`transition-all duration-300 ${view === "individual" ? "opacity-100" : "hidden opacity-0"}`}>
              <div className="grid grid-cols-[70px_1fr_1fr_90px_90px] bg-[#F6F1E6] px-5 py-4 text-[11px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                <div>Position</div>
                <div>Player</div>
                <div>School</div>
                <div>To Par</div>
                <div>Through</div>
              </div>

              {players.map((player, index) => (
                <div key={player.name} className={`grid grid-cols-[70px_1fr_1fr_90px_90px] items-center border-t border-[#E8DCC8] px-5 py-5 text-sm transition duration-300 hover:-translate-y-0.5 hover:bg-white ${index === 0 ? "bg-[#FFFDF7]" : "bg-transparent"}`}>
                  <div className="font-semibold">{player.pos}</div>
                  <div className="font-black">{player.name}</div>
                  <div className="text-[#51635C]">{player.school}</div>
                  <div className="font-black text-[#B8892D]">{player.toPar}</div>
                  <div>{player.thru}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
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
