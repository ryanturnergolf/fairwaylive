import PlayerPerformanceProfile from "./PlayerPerformanceProfile";

export default async function PlayerPerformancePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  return <PlayerPerformanceProfile playerId={playerId} />;
}
