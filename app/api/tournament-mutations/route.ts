import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabaseClient";
import { buildShareTokenExpiration, createRawShareToken, hashShareToken, type ShareTokenPurpose } from "../../lib/shareTokens";

export const dynamic = "force-dynamic";

type MutationBody =
  | {
      action: "createTournament";
      input: {
        name: string;
        course: string;
        tournamentDate: string;
        numberOfRounds: number;
        status: string;
      };
    }
  | {
      action: "reconcileTournamentPlayers";
      scopes: Array<{ tournamentId: string; roundNumber: number }>;
      rows: Array<Record<string, unknown>>;
    }
  | {
      action: "upsertTournamentStateSnapshot";
      input: {
        tournamentId: string;
        localTournamentId: string;
        schemaVersion: number;
        stateSnapshot: unknown;
        expectedAggregateVersion?: number | null;
      };
    }
  | {
      action: "createShareToken";
      input: {
        tournamentId: string;
        purpose: ShareTokenPurpose;
      };
    }
  | {
      action: "revokeShareToken";
      input: {
        tokenId: string;
      };
    }
  | {
      action: "ensureTeamTournamentCodes";
      assignments: Array<{
        tournamentId: string;
        teamId: string;
        teamName: string;
        code: string;
      }>;
    }
  | {
      action: "generateTeamTournamentCode";
      input: { tournamentId: string; teamId: string; teamName: string };
    }
  | {
      action: "regenerateTeamTournamentCode";
      input: { tournamentId: string; teamId: string };
    }
  | {
      action: "finalizeTournament";
      input: {
        tournamentId: string;
        localTournamentId: string;
        schemaVersion: number;
        stateSnapshot: unknown;
        finalizedAt: string;
      };
    };

const tournamentColumns =
  "id,created_by,owner_id,name,course,tournament_date,number_of_rounds,status,finalized_at,aggregate_version,created_at,updated_at";

const getAuthenticatedClient = async (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";

  if (!accessToken) {
    throw new AuthenticationError("Coach authentication is required.");
  }

  const supabase = getSupabaseServerClient({ accessToken });

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user || userData.user.is_anonymous) {
    throw new AuthenticationError("The coach session is invalid or expired.");
  }

  const { data: coach, error: coachError } = await supabase
    .from("coaches")
    .select("id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (coachError || !coach) {
    throw new AuthorizationError("This account is not authorized as a coach.");
  }

  return { supabase, coachId: userData.user.id };
};

class AuthenticationError extends Error {}
class AuthorizationError extends Error {}
class MutationConflictError extends Error {}

const teamCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const createRandomTeamCode = () => {
  const values = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(values, (value) => teamCodeAlphabet[value % teamCodeAlphabet.length]).join("");
};

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "Request failed.";
};

const jsonError = (error: unknown, status = 400) => {
  const message = extractErrorMessage(error);
  const httpStatus = error instanceof AuthenticationError
      ? 401
      : error instanceof AuthorizationError || (error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === "42501")
        ? 403
        : error instanceof MutationConflictError
          ? 409
      : status;
  return NextResponse.json({ error: message }, { status: httpStatus });
};

export async function POST(request: Request) {
  let body: MutationBody;

  try {
    body = (await request.json()) as MutationBody;
  } catch {
    return jsonError(new Error("Invalid JSON body."));
  }

  try {
    const { supabase, coachId } = await getAuthenticatedClient(request);

    if (body.action === "createTournament") {
      // Use INSERT (Prefer: return=minimal) then a separate SELECT to avoid a timing issue
      // where PostgREST's RETURNING clause evaluates the SELECT RLS policy before the AFTER
      // trigger has inserted the required tournament_memberships row.
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const authorization = request.headers.get("authorization") ?? "";
      const rawAccessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";

      const insertResp = await fetch(`${supabaseUrl}/rest/v1/tournaments`, {
        method: "POST",
        headers: {
          "apikey": supabaseAnonKey ?? "",
          "Authorization": `Bearer ${rawAccessToken}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          name: body.input.name,
          course: body.input.course,
          tournament_date: body.input.tournamentDate || null,
          number_of_rounds: body.input.numberOfRounds,
          status: body.input.status,
          owner_id: coachId,
        }),
      });

      if (!insertResp.ok) {
        const errBody = await insertResp.json().catch(() => null) as { message?: string } | null;
        throw Object.assign(new Error(errBody?.message ?? "Tournament insert failed."), {
          code: insertResp.status === 403 ? "42501" : "ERROR",
        });
      }

      // Now SELECT the newly created tournament (membership exists now, SELECT RLS passes)
      const selectResp = await fetch(
        `${supabaseUrl}/rest/v1/tournaments?owner_id=eq.${coachId}&order=created_at.desc&limit=1&select=${tournamentColumns}`,
        {
          headers: {
            "apikey": supabaseAnonKey ?? "",
            "Authorization": `Bearer ${rawAccessToken}`,
          },
        }
      );
      const rows = await selectResp.json() as Array<Record<string, unknown>>;
      const inserted = rows[0];
      if (!inserted) throw new Error("Tournament was created but could not be retrieved.");
      return NextResponse.json(inserted, { status: 201 });
    }

    if (body.action === "reconcileTournamentPlayers") {
      for (const scope of body.scopes) {
        if (!scope.tournamentId || !Number.isInteger(scope.roundNumber) || scope.roundNumber < 1) {
          throw new Error("Invalid tournament-player reconciliation scope.");
        }
        const authoritativeIds = new Set(
          body.rows
            .filter(
              (row) => row.tournament_id === scope.tournamentId && row.round_number === scope.roundNumber
            )
            .map((row) => String(row.player_id))
        );
        const { data: existingRows, error: readError } = await supabase
          .from("tournament_players")
          .select("player_id")
          .eq("tournament_id", scope.tournamentId)
          .eq("round_number", scope.roundNumber);
        if (readError) throw readError;

        const staleIds = (existingRows ?? [])
          .map((row) => String(row.player_id))
          .filter((playerId) => !authoritativeIds.has(playerId));
        if (staleIds.length > 0) {
          const { error: deleteError } = await supabase
            .from("tournament_players")
            .delete()
            .eq("tournament_id", scope.tournamentId)
            .eq("round_number", scope.roundNumber)
            .in("player_id", staleIds);
          if (deleteError) throw deleteError;
        }
      }

      if (body.rows.length === 0) {
        return NextResponse.json({ ok: true });
      }
      const { error } = await supabase
        .from("tournament_players")
        .upsert(body.rows, { onConflict: "tournament_id,round_number,player_id" });

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "upsertTournamentStateSnapshot") {
      const payload = {
        tournament_id: body.input.tournamentId,
        local_tournament_id: body.input.localTournamentId || null,
        schema_version: body.input.schemaVersion,
        state_snapshot: body.input.stateSnapshot,
      };

      const query = supabase
        .from("tournament_state_snapshots")
        .upsert(payload, { onConflict: "tournament_id" });

      const { error } =
        typeof body.input.expectedAggregateVersion === "number"
          ? await query.eq("aggregate_version", body.input.expectedAggregateVersion)
          : await query;

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "createShareToken") {
      const rawToken = createRawShareToken();
      const tokenHash = await hashShareToken(rawToken);
      const { data, error } = await supabase
        .from("tournament_share_tokens")
        .insert({
          tournament_id: body.input.tournamentId,
          token_hash: tokenHash,
          purpose: body.input.purpose,
          expires_at: buildShareTokenExpiration(body.input.purpose),
        })
        .select("id,tournament_id,purpose,expires_at,revoked_at,created_at")
        .single();

      if (error) throw error;
      return NextResponse.json({ ...data, token: rawToken }, { status: 201 });
    }

    if (body.action === "revokeShareToken") {
      const { error } = await supabase
        .from("tournament_share_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", body.input.tokenId);

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "ensureTeamTournamentCodes") {
      if (body.assignments.length === 0) {
        return NextResponse.json({ assignments: [] });
      }
      const assignments = body.assignments.map((assignment) => ({
        tournament_id: assignment.tournamentId,
        team_id: assignment.teamId,
        team_name: assignment.teamName.trim(),
        code: assignment.code.trim().toUpperCase(),
      }));
      if (assignments.some((assignment) => !/^[A-HJ-KM-NP-Z2-9]{6}$/.test(assignment.code))) {
        throw new Error("Team Tournament Codes must contain six supported uppercase characters.");
      }
      const { error } = await supabase
        .from("team_tournament_codes")
        .upsert(assignments, { onConflict: "tournament_id,team_id", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      const tournamentIds = [...new Set(assignments.map((assignment) => assignment.tournament_id))];
      const { data, error: readError } = await supabase
        .from("team_tournament_codes")
        .select("tournament_id,team_id,team_name,code")
        .in("tournament_id", tournamentIds);
      if (readError) throw readError;
      return NextResponse.json({
        assignments: (data ?? []).map((row) => ({
          tournamentId: row.tournament_id,
          teamId: row.team_id,
          teamName: row.team_name,
          code: row.code,
        })),
      });
    }

    if (body.action === "generateTeamTournamentCode" || body.action === "regenerateTeamTournamentCode") {
      const { tournamentId, teamId } = body.input;
      const { data: tournament, error: tournamentError } = await supabase
        .from("tournaments")
        .select("id")
        .eq("id", tournamentId)
        .maybeSingle();
      if (tournamentError) throw tournamentError;
      if (!tournament) throw new AuthorizationError("You are not authorized to manage this tournament.");

      const { data: existing, error: existingError } = await supabase
        .from("team_tournament_codes")
        .select("team_name,code")
        .eq("tournament_id", tournamentId)
        .eq("team_id", teamId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (body.action === "regenerateTeamTournamentCode" && !existing) {
        throw new MutationConflictError("This team does not have a code to regenerate.");
      }
      if (body.action === "generateTeamTournamentCode" && existing) {
        return NextResponse.json({ assignment: { tournamentId, teamId, teamName: existing.team_name, code: existing.code } });
      }
      if (body.action === "generateTeamTournamentCode") {
        const { data: participatingTeam, error: teamError } = await supabase
          .from("tournament_players")
          .select("team_id")
          .eq("tournament_id", tournamentId)
          .eq("team_id", teamId)
          .limit(1)
          .maybeSingle();
        if (teamError) throw teamError;
        if (!participatingTeam) throw new AuthorizationError("This team is not participating in the tournament.");
      }

      let assignment: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt < 12 && !assignment; attempt += 1) {
        const code = createRandomTeamCode();
        const query = body.action === "generateTeamTournamentCode"
          ? supabase.from("team_tournament_codes").insert({
              tournament_id: tournamentId,
              team_id: teamId,
              team_name: body.input.teamName.trim(),
              code,
            })
          : supabase.from("team_tournament_codes").update({ code }).eq("tournament_id", tournamentId).eq("team_id", teamId);
        const { data, error } = await query.select("tournament_id,team_id,team_name,code").maybeSingle();
        if (error && error.code === "23505") continue;
        if (error) throw error;
        assignment = data;
      }
      if (!assignment) throw new MutationConflictError("Unable to create a unique team code. Please try again.");
      return NextResponse.json({
        assignment: {
          tournamentId: assignment.tournament_id,
          teamId: assignment.team_id,
          teamName: assignment.team_name,
          code: assignment.code,
        },
      });
    }

    if (body.action === "finalizeTournament") {
      const { data: tournament, error: tournamentReadError } = await supabase
        .from("tournaments")
        .select(tournamentColumns)
        .eq("id", body.input.tournamentId)
        .maybeSingle();
      if (tournamentReadError) throw tournamentReadError;
      if (!tournament) throw new MutationConflictError("Tournament could not be loaded for finalization.");
      if (tournament.finalized_at || ["finalized", "complete"].includes(String(tournament.status).toLowerCase())) {
        throw new MutationConflictError("Tournament is already finalized.");
      }

      const { data: snapshot, error: snapshotReadError } = await supabase
        .from("tournament_state_snapshots")
        .select("aggregate_version")
        .eq("tournament_id", body.input.tournamentId)
        .maybeSingle();
      if (snapshotReadError) throw snapshotReadError;
      if (!snapshot) throw new MutationConflictError("Tournament snapshot could not be loaded for finalization.");

      const { data: finalizedSnapshot, error: snapshotWriteError } = await supabase
        .from("tournament_state_snapshots")
        .update({
          local_tournament_id: body.input.localTournamentId || null,
          schema_version: body.input.schemaVersion,
          state_snapshot: body.input.stateSnapshot,
        })
        .eq("tournament_id", body.input.tournamentId)
        .eq("aggregate_version", snapshot.aggregate_version)
        .select("aggregate_version")
        .maybeSingle();
      if (snapshotWriteError) throw snapshotWriteError;
      if (!finalizedSnapshot) throw new MutationConflictError("Tournament snapshot changed before finalization completed.");

      const { data: finalizedTournament, error: tournamentWriteError } = await supabase
        .from("tournaments")
        .update({
          status: "finalized",
          finalized_at: body.input.finalizedAt,
          aggregate_version: Number(tournament.aggregate_version) + 1,
        })
        .eq("id", body.input.tournamentId)
        .eq("aggregate_version", tournament.aggregate_version)
        .is("finalized_at", null)
        .select(tournamentColumns)
        .maybeSingle();
      if (tournamentWriteError) throw tournamentWriteError;
      if (!finalizedTournament) throw new MutationConflictError("Tournament changed before finalization completed.");

      return NextResponse.json({
        tournament: finalizedTournament,
        snapshotAggregateVersion: finalizedSnapshot.aggregate_version,
      });
    }

    return jsonError(new Error("Unknown mutation action."));
  } catch (error) {
    return jsonError(error, 500);
  }
}
