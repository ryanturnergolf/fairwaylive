export type TournamentSaveTask = (isObsolete: () => boolean) => Promise<void>;

type PendingSave = {
  sequence: number;
  task: TournamentSaveTask;
};

export const createTournamentSaveCoordinator = () => {
  let latestSequence = 0;
  let pendingSave: PendingSave | null = null;
  let drainPromise: Promise<void> | null = null;

  const drain = async () => {
    while (pendingSave) {
      const save = pendingSave;
      pendingSave = null;
      await save.task(() => save.sequence !== latestSequence);
    }
  };

  const startDrain = () => {
    if (!drainPromise) {
      drainPromise = drain().finally(() => {
        drainPromise = null;
        if (pendingSave) startDrain();
      });
    }
    return drainPromise;
  };

  return {
    enqueue(task: TournamentSaveTask) {
      latestSequence += 1;
      pendingSave = { sequence: latestSequence, task };
      void startDrain();
      return latestSequence;
    },
    async flush() {
      while (drainPromise || pendingSave) {
        await (drainPromise ?? startDrain());
      }
    },
    hasPendingSave() {
      return Boolean(drainPromise || pendingSave);
    },
  };
};

export type TournamentSaveCoordinator = ReturnType<typeof createTournamentSaveCoordinator>;
