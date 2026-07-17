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
