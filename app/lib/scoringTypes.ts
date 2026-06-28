/**
 * Group Scoring Types
 * 
 * These types define the data structures for the future group scoring workflow.
 * They are not currently used in the app but provide the foundation for:
 * - Group scoring with multiple markers
 * - Self-marker scoring
 * - Coach scoring
 * - Score verification and discrepancy resolution
 */

/**
 * Scoring mode for a tournament or round
 */
export type ScoringMode = "group" | "self-marker" | "coach";

/**
 * Status of a score within the scoring workflow
 */
export type ScoreStatus = "live" | "review" | "submitted";

/**
 * QR code data for group scoring
 * Encodes pairing and tournament information for mobile access
 */
export interface GroupScoringCode {
  tournamentId: string;
  pairingId: string;
  groupNumber: number;
  code: string;
  qrUrl: string;
}

/**
 * Individual hole score entered by a marker or self-marker
 */
export interface PlayerHoleScore {
  playerId: string;
  holeNumber: number;
  score: number;
  enteredByPlayerId: string;
  markerForPlayerId?: string;
  status: ScoreStatus;
  updatedAt: number; // timestamp
}

/**
 * Complete round score for a player
 * Aggregates all hole scores and metadata
 */
export interface PlayerRoundScore {
  playerId: string;
  roundId: string;
  holeScores: number[];
  total: number;
  status: ScoreStatus;
  lastUpdatedAt: number; // timestamp
}

/**
 * Discrepancy between self-reported and marker scores
 * Used for score verification and dispute resolution
 */
export interface ScoreDiscrepancy {
  playerId: string;
  holeNumber: number;
  selfScore: number;
  markerScore: number;
  resolved: boolean;
}
