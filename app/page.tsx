export default function Home() {
  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <section className="relative overflow-hidden bg-gradient-to-br from-black via-zinc-900 to-green-950 text-white">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute left-10 top-20 h-72 w-72 rounded-full bg-green-500 blur-3xl" />
          <div className="absolute bottom-0 right-10 h-96 w-96 rounded-full bg-emerald-400 blur-3xl" />
        </div>

        <nav className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-500 text-xl font-black text-black">
              FL
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">FairwayLive</p>
              <p className="text-xs uppercase tracking-[0.25em] text-green-300">
                College Golf Scoring
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-8 text-sm text-zinc-300 md:flex">
            <a href="#" className="hover:text-white">Leaderboards</a>
            <a href="#" className="hover:text-white">Tournaments</a>
            <a href="#" className="hover:text-white">Admin</a>
            <a href="#" className="hover:text-white">Login</a>
          </div>
        </nav>

        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 pb-24 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="mb-6 inline-flex rounded-full border border-green-400/30 bg-green-400/10 px-4 py-2 text-sm text-green-200">
              Live tournament scoring built for college golf
            </div>

            <h1 className="max-w-4xl text-5xl font-black leading-tight tracking-tight md:text-7xl">
              Live golf scoring that feels built for game day.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
              Players enter scores from the course. Coaches, parents, and fans follow live team and individual leaderboards in real time.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <a className="rounded-full bg-green-400 px-7 py-4 text-center font-bold text-black shadow-lg shadow-green-500/20 hover:bg-green-300" href="#">
                View Live Leaderboard
              </a>
              <a className="rounded-full border border-white/20 px-7 py-4 text-center font-bold text-white hover:bg-white/10" href="#">
                Host a Tournament
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-green-300">LIVE NOW</p>
                <h2 className="text-2xl font-bold">Buckeye College Invitational</h2>
              </div>
              <div className="rounded-full bg-green-400 px-3 py-1 text-sm font-bold text-black">
                Round 1
              </div>
            </div>

            <div className="space-y-3">
              {[
                ["1", "Bluffton University", "-8", "14-17"],
                ["2", "Ohio Northern", "-5", "13-17"],
                ["3", "Heidelberg", "-2", "12-16"],
                ["4", "Defiance", "+1", "11-15"],
              ].map(([place, team, score, thru]) => (
                <div key={team} className="grid grid-cols-[40px_1fr_70px_70px] items-center rounded-2xl bg-black/35 px-4 py-4">
                  <div className="font-black text-green-300">{place}</div>
                  <div>
                    <p className="font-bold">{team}</p>
                    <p className="text-xs text-zinc-400">Team total</p>
                  </div>
                  <div className="text-right text-xl font-black">{score}</div>
                  <div className="text-right text-sm text-zinc-300">Thru {thru}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-16 md:grid-cols-3">
        {[
          ["Player Scoring", "Simple mobile score entry for players on the course."],
          ["Live Leaderboards", "Team and individual standings update as scores come in."],
          ["Admin Control", "Manage pairings, tee times, logos, yardages, and score overrides."],
        ].map(([title, text]) => (
          <div key={title} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-8">
            <h3 className="text-2xl font-black">{title}</h3>
            <p className="mt-3 leading-7 text-zinc-600">{text}</p>
          </div>
        ))}
      </section>
    </main>
    );
}