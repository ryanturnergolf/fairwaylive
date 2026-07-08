"use client";

import type { ChangeEvent, FormEvent } from "react";

export type Team = {
  id: number;
  schoolName: string;
  shortName: string;
  teamColor: string;
  coachName: string;
};

export type TeamFormState = {
  schoolName: string;
  shortName: string;
  teamColor: string;
  coachName: string;
};

export type Player = {
  id: number;
  firstName: string;
  lastName: string;
  teamId: string;
  teamName: string;
  handicap: string;
  email: string;
};

export type PlayerFormState = {
  firstName: string;
  lastName: string;
  teamId: string;
  handicap: string;
  email: string;
};

export type ImportedPlayerPreview = {
  firstName: string;
  lastName: string;
  school: string;
  gender: string;
  className: string;
  email: string;
  teamId: string;
  teamName: string;
  handicap: string;
};

type TeamErrors = Partial<Record<keyof TeamFormState, string>>;
type PlayerErrors = Partial<Record<keyof PlayerFormState, string>>;

type TeamPlayerManagementProps = {
  activeTab: "Teams" | "Players";
  teams: Team[];
  players: Player[];
  isTeamModalOpen: boolean;
  editingTeamId: number | null;
  teamFormState: TeamFormState;
  teamErrors: TeamErrors;
  isPlayerModalOpen: boolean;
  editingPlayerId: number | null;
  playerFormState: PlayerFormState;
  playerErrors: PlayerErrors;
  isPlayerImportModalOpen: boolean;
  playerImportRows: ImportedPlayerPreview[];
  playerImportError: string;
  playerImportFileName: string;
  onOpenAddTeamModal: () => void;
  onOpenEditTeamModal: (team: Team) => void;
  onDeleteTeam: (teamId: number) => void;
  onCloseTeamModal: () => void;
  onTeamInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTeamSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenPlayerImportModal: () => void;
  onOpenAddPlayerModal: () => void;
  onOpenEditPlayerModal: (player: Player) => void;
  onDeletePlayer: (playerId: number) => void;
  onClosePlayerModal: () => void;
  onPlayerInputChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onPlayerSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClosePlayerImportModal: () => void;
  onPlayerImportTemplateDownload: () => void;
  onPlayerImportFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPlayerImportConfirm: () => void;
};

export default function TeamPlayerManagement({
  activeTab,
  teams,
  players,
  isTeamModalOpen,
  editingTeamId,
  teamFormState,
  teamErrors,
  isPlayerModalOpen,
  editingPlayerId,
  playerFormState,
  playerErrors,
  isPlayerImportModalOpen,
  playerImportRows,
  playerImportError,
  playerImportFileName,
  onOpenAddTeamModal,
  onOpenEditTeamModal,
  onDeleteTeam,
  onCloseTeamModal,
  onTeamInputChange,
  onTeamSubmit,
  onOpenPlayerImportModal,
  onOpenAddPlayerModal,
  onOpenEditPlayerModal,
  onDeletePlayer,
  onClosePlayerModal,
  onPlayerInputChange,
  onPlayerSubmit,
  onClosePlayerImportModal,
  onPlayerImportTemplateDownload,
  onPlayerImportFileChange,
  onPlayerImportConfirm,
}: TeamPlayerManagementProps) {
  return (
    <>
      {activeTab === "Teams" ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                Teams
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                Build your tournament field.
              </h3>
            </div>
            <button
              type="button"
              onClick={onOpenAddTeamModal}
              className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
            >
              Add Team
            </button>
          </div>

          {teams.length === 0 ? (
            <div className="rounded-[32px] border border-[#E8DCC8] bg-[#FCFAF5] p-10 text-center shadow-inner">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#0B3D2E] text-2xl font-black text-[#F0C96A]">
                HQ
              </div>
              <h4 className="mt-6 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                No teams have been added.
              </h4>
              <p className="mx-auto mt-3 max-w-2xl text-lg leading-8 text-[#51635C]">
                Add your first college team to begin building the tournament.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {teams.map((team) => (
                <div key={team.id} className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-7 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                        {team.shortName}
                      </p>
                      <h4 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                        {team.schoolName}
                      </h4>
                    </div>
                    <div className="h-5 w-5 rounded-full border border-[#E8DCC8]" style={{ backgroundColor: team.teamColor || "#0B3D2E" }} />
                  </div>

                  <div className="mt-6 space-y-3 text-sm text-[#51635C]">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold uppercase tracking-[0.25em]">Coach</span>
                      <span className="text-right font-black text-[#0B3D2E]">{team.coachName}</span>
                    </div>
                  </div>

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => onOpenEditTeamModal(team)}
                      className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTeam(team.id)}
                      className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                Players
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                Build your player roster.
              </h3>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onOpenPlayerImportModal}
                className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
              >
                Import Players
              </button>
              <button
                type="button"
                onClick={onOpenAddPlayerModal}
                className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
              >
                Add Player
              </button>
            </div>
          </div>

          {players.length === 0 ? (
            <div className="rounded-[32px] border border-[#E8DCC8] bg-[#FCFAF5] p-10 text-center shadow-inner">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#0B3D2E] text-2xl font-black text-[#F0C96A]">
                HQ
              </div>
              <h4 className="mt-6 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                No players have been added.
              </h4>
              <p className="mx-auto mt-3 max-w-2xl text-lg leading-8 text-[#51635C]">
                Add your first player to begin building the tournament.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {players.map((player) => (
                <div key={player.id} className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-7 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                      {player.teamName}
                    </p>
                    <h4 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                      {player.firstName} {player.lastName}
                    </h4>
                  </div>

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => onOpenEditPlayerModal(player)}
                      className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePlayer(player.id)}
                      className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isPlayerImportModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/70 px-4 py-6 backdrop-blur-sm"
          onClick={onClosePlayerImportModal}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    Player Import
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    Import Players
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onClosePlayerImportModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="px-7 py-7">
              <p className="text-base leading-8 text-[#51635C]">
                Download the CSV template, upload a completed file, preview imported players, and confirm the import into your tournament roster.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={onPlayerImportTemplateDownload}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Download CSV Template
                </button>
                <label className="flex cursor-pointer items-center justify-center rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5">
                  <span>Upload CSV</span>
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={onPlayerImportFileChange} />
                </label>
              </div>

              {playerImportFileName ? (
                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  Selected file: {playerImportFileName}
                </p>
              ) : null}

              {playerImportError ? (
                <div className="mt-4 rounded-2xl border border-[#E8DCC8] bg-white/80 px-4 py-3 text-sm text-[#0B3D2E]">
                  {playerImportError}
                </div>
              ) : null}

              {playerImportRows.length > 0 ? (
                <div className="mt-6 rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5 shadow-inner">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black uppercase tracking-[0.3em] text-[#B8892D]">
                      Preview Imported Players
                    </p>
                    <span className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">
                      {playerImportRows.length} rows
                    </span>
                  </div>

                  <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                    {playerImportRows.map((row, index) => (
                      <div key={`${row.firstName}-${row.lastName}-${index}`} className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-sm text-[#0B3D2E]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="font-black">{row.firstName} {row.lastName}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#51635C]">{row.school}</span>
                        </div>
                        <div className="mt-2 text-xs uppercase tracking-[0.25em] text-[#51635C]">
                          {row.gender} • {row.className} • {row.email}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-[24px] border border-dashed border-[#E8DCC8] bg-[#FCFAF5] p-8 text-center text-[#51635C]">
                  Upload a CSV file to preview imported players before confirming.
                </div>
              )}

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClosePlayerImportModal}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onPlayerImportConfirm}
                  disabled={playerImportRows.length === 0}
                  className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#51635C]"
                >
                  Confirm Import
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isTeamModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0B3D2E]/70 px-4 py-6 backdrop-blur-sm sm:items-center"
          onClick={onCloseTeamModal}
        >
          <div
            className="flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    Team Management
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    {editingTeamId ? "Edit Team" : "Add Team"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onCloseTeamModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  ×
                </button>
              </div>
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={onTeamSubmit}>
              <div className="min-h-0 flex-1 overflow-y-auto px-7 py-7">
                <div className="grid gap-5 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C] sm:col-span-2">
                  <span>School Name</span>
                  <input
                    name="schoolName"
                    value={teamFormState.schoolName}
                    onChange={onTeamInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. Bluffton University"
                  />
                  {teamErrors.schoolName ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{teamErrors.schoolName}</p> : null}
                </label>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-[#E8DCC8] bg-[#F6F1E6] px-7 py-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onCloseTeamModal}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                >
                  {editingTeamId ? "Save Team" : "Add Team"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isPlayerModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0B3D2E]/70 px-4 py-6 backdrop-blur-sm sm:items-center"
          onClick={onClosePlayerModal}
        >
          <div
            className="flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    Player Management
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    {editingPlayerId ? "Edit Player" : "Add Player"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onClosePlayerModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  ×
                </button>
              </div>
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={onPlayerSubmit}>
              <div className="min-h-0 flex-1 overflow-y-auto px-7 py-7">
                <div className="grid gap-5 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  <span>First Name</span>
                  <input
                    name="firstName"
                    value={playerFormState.firstName}
                    onChange={onPlayerInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. Alex"
                  />
                  {playerErrors.firstName ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{playerErrors.firstName}</p> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  <span>Last Name</span>
                  <input
                    name="lastName"
                    value={playerFormState.lastName}
                    onChange={onPlayerInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. Thompson"
                  />
                  {playerErrors.lastName ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{playerErrors.lastName}</p> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  <span>Team</span>
                  <select
                    name="teamId"
                    value={playerFormState.teamId}
                    onChange={onPlayerInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                  >
                    <option value="">Select a team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={String(team.id)}>
                        {team.schoolName}
                      </option>
                    ))}
                  </select>
                  {playerErrors.teamId ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{playerErrors.teamId}</p> : null}
                </label>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-[#E8DCC8] bg-[#F6F1E6] px-7 py-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClosePlayerModal}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                >
                  {editingPlayerId ? "Save Player" : "Add Player"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
