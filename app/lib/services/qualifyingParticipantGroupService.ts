import type {
  QualifyingGroup,
  QualifyingGroupMember,
  QualifyingGroupRecord,
  QualifyingParticipant,
  QualifyingRosterPlayer,
} from "../qualifyingModel";

export type QualifyingParticipantGroupConfiguration = {
  selectedPlayers: QualifyingRosterPlayer[];
  groups: QualifyingGroup[];
  source: "relational" | "legacy_json";
};

export const resolveQualifyingParticipantGroupConfiguration = ({
  participants,
  groups,
  members,
  legacyPlayers,
  legacyGroups,
}: {
  participants: QualifyingParticipant[];
  groups: QualifyingGroupRecord[];
  members: QualifyingGroupMember[];
  legacyPlayers: QualifyingRosterPlayer[];
  legacyGroups: QualifyingGroup[];
}): QualifyingParticipantGroupConfiguration => {
  if (participants.length === 0 && groups.length === 0) {
    return {
      selectedPlayers: legacyPlayers,
      groups: legacyGroups,
      source: "legacy_json",
    };
  }

  const orderedParticipants = [...participants].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder || left.playerId.localeCompare(right.playerId)
  );
  const participantById = new Map(
    orderedParticipants.map((participant) => [participant.id, participant])
  );
  const orderedGroups = [...groups].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder || left.groupNumber - right.groupNumber
  );

  return {
    selectedPlayers: orderedParticipants.map((participant) => ({
      id: participant.playerId,
      name: participant.playerName,
      rosterType: participant.rosterType,
      classYear: "",
    })),
    groups: orderedGroups.map((group) => ({
      id: group.id,
      name: `Group ${group.groupNumber}`,
      playerIds: members
        .filter((member) => member.qualifyingGroupId === group.id)
        .sort((left, right) => left.memberOrder - right.memberOrder)
        .map((member) => participantById.get(member.qualifyingParticipantId)?.playerId)
        .filter((playerId): playerId is string => Boolean(playerId)),
    })),
    source: "relational",
  };
};
