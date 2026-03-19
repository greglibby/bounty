import type { GameStats } from "../types/index.js";

interface SubStatEntry {
  high: number;
  low: number | null;
  success: number;
  attempts: number;
}

interface QueenRoundLengthStat {
  low: number | null;
  high: number;
  totalGuesses: number;
  totalRounds: number;
}

interface BountyDeclinedStat {
  high: number;
  low: number | null;
  total: number;
}

interface BountyInstantStat {
  success: number;
  totalAccepted: number;
}

interface RankAccuracyEntry {
  s?: number;
  t?: number;
  correct?: number;
  incorrect?: number;
  ties?: number;
  total?: number;
}

interface AllTimeRecords {
  longestGameTurns: number;
  shortestGameTurns: number;
  mostRounds: number;
  shortestGameRounds: number;
  totalGamesPlayed: number;
  totalTurnsAllTime: number;
  totalRoundsAllTime: number;
  gamesWon: number;
  eliminationCauses: Record<string, number>;
  winMethods: { LAST_MAN_STANDING: number; BOUNTY_INSTANT: number };
  rankAccuracyAllTime: RankAccuracyEntry[];
  totalTiesWithDiscard: number;
  mostTiesInOneGame: number;
  lowTiesInOneGame?: number | null;
  mostSpecialistsInOneGame: Record<string, number>;
  lowSpecialists: Record<string, number | null>;
  totalSpecialistCounts: Record<string, number>;
  mostCombosInOneGame: Record<string, number>;
  lowCombosInOneGame: Record<string, number | null>;
  totalComboCounts: Record<string, number>;
  subStats: {
    aceSuccess: SubStatEntry;
    lucky7Success: SubStatEntry;
    queenGuessAccuracy: SubStatEntry;
    queenRoundLength: QueenRoundLengthStat;
    bountyDeclined: BountyDeclinedStat;
    bountyInstant: BountyInstantStat;
    sabotageCleared: SubStatEntry;
  };
}

export const RecordManager = {
  /**
   * Fetches the all-time records from localStorage.
   * Merges existing data with new keys to prevent data loss.
   */
  getRecords(): AllTimeRecords {
    const saved = localStorage.getItem("BOUNTY_RECORDS");
    const defaultRecords: AllTimeRecords = {
      longestGameTurns: 0,
      shortestGameTurns: 0,
      mostRounds: 0,
      shortestGameRounds: 0,
      totalGamesPlayed: 0,
      totalTurnsAllTime: 0,
      totalRoundsAllTime: 0,
      gamesWon: 0,
      eliminationCauses: {},
      winMethods: { LAST_MAN_STANDING: 0, BOUNTY_INSTANT: 0 },
      rankAccuracyAllTime: Array.from({ length: 14 }, () => ({ s: 0, t: 0 })),
      totalTiesWithDiscard: 0,
      mostTiesInOneGame: 0,
      mostSpecialistsInOneGame: {
        ace: 0,
        sabotage: 0,
        shield: 0,
        lucky7: 0,
        queen: 0,
        bounty: 0,
      },
      lowSpecialists: {
        ace: null,
        sabotage: null,
        shield: null,
        lucky7: null,
        queen: null,
        bounty: null,
      },
      totalSpecialistCounts: {
        ace: 0,
        sabotage: 0,
        shield: 0,
        lucky7: 0,
        queen: 0,
        bounty: 0,
      },
      // COMBO TRACKING
      mostCombosInOneGame: { pair: 0, straight: 0, flush: 0 },
      lowCombosInOneGame: { pair: null, straight: null, flush: null },
      totalComboCounts: { pair: 0, straight: 0, flush: 0 },

      subStats: {
        aceSuccess: { high: 0, low: null, success: 0, attempts: 0 },
        lucky7Success: { high: 0, low: null, success: 0, attempts: 0 },
        queenGuessAccuracy: { high: 0, low: null, success: 0, attempts: 0 },
        queenRoundLength: {
          low: null,
          high: 0,
          totalGuesses: 0,
          totalRounds: 0,
        },
        bountyDeclined: { high: 0, low: null, total: 0 },
        bountyInstant: { success: 0, totalAccepted: 0 },
        sabotageCleared: { high: 0, low: null, success: 0, attempts: 0 },
      },
    };

    if (!saved) return defaultRecords;

    const parsed: Partial<AllTimeRecords> = JSON.parse(saved);
    return {
      ...defaultRecords,
      ...parsed,
      mostCombosInOneGame: {
        ...defaultRecords.mostCombosInOneGame,
        ...(parsed.mostCombosInOneGame || {}),
      },
      lowCombosInOneGame: {
        ...defaultRecords.lowCombosInOneGame,
        ...(parsed.lowCombosInOneGame || {}),
      },
      totalComboCounts: {
        ...defaultRecords.totalComboCounts,
        ...(parsed.totalComboCounts || {}),
      },
      eliminationCauses: parsed.eliminationCauses || {},
      winMethods: parsed.winMethods || {
        LAST_MAN_STANDING: 0,
        BOUNTY_INSTANT: 0,
      },
      rankAccuracyAllTime:
        parsed.rankAccuracyAllTime || defaultRecords.rankAccuracyAllTime,
      subStats: { ...defaultRecords.subStats, ...(parsed.subStats || {}) },
    };
  },

  updateRecords(currentGameStats: GameStats): AllTimeRecords {
    const records = this.getRecords();
    const s = currentGameStats.specialists || {
      ace: {},
      sabotage: {},
      shield: {},
      lucky7: {},
      queen: {},
      bounty: {},
    };

    // 1. Increment global game counts
    records.totalGamesPlayed++;
    if ((currentGameStats as any).playerWon) records.gamesWon++;

    // Increment total accumulators for averages (Hardened with Number casting)
    records.totalTurnsAllTime += Number(currentGameStats.totalTurns) || 0;
    records.totalRoundsAllTime += Number(currentGameStats.totalRounds) || 0;

    // Accumulate total Ties that led to discards
    records.totalTiesWithDiscard =
      (Number(records.totalTiesWithDiscard) || 0) +
      (Number(currentGameStats.tiesWithDiscard) || 0);

    // --- WIN METHOD TRACKING ---
    const method = currentGameStats.winMethod || "LAST_MAN_STANDING";
    if (!records.winMethods)
      records.winMethods = { LAST_MAN_STANDING: 0, BOUNTY_INSTANT: 0 };
    (records.winMethods as Record<string, number>)[method] =
      (Number((records.winMethods as Record<string, number>)[method]) || 0) + 1;

    // --- ELIMINATION CAUSE TRACKING ---
    if (currentGameStats.eliminationCauses) {
      if (!records.eliminationCauses) records.eliminationCauses = {};
      for (const [cause, count] of Object.entries(
        currentGameStats.eliminationCauses,
      )) {
        records.eliminationCauses[cause] =
          (Number(records.eliminationCauses[cause]) || 0) +
          (Number(count) || 0);
      }
    }

    // --- RANK ACCURACY TRACKING (5-Column Layout) ---
    if (currentGameStats.rankAccuracy) {
      if (!records.rankAccuracyAllTime) {
        records.rankAccuracyAllTime = Array.from({ length: 14 }, () => ({
          correct: 0,
          incorrect: 0,
          ties: 0,
          total: 0,
        }));
      }

      currentGameStats.rankAccuracy.forEach((data, rank) => {
        if (rank === 0 || !data) return;

        if (
          !records.rankAccuracyAllTime[rank] ||
          typeof (records.rankAccuracyAllTime[rank] as any).correct === "undefined"
        ) {
          records.rankAccuracyAllTime[rank] = {
            correct: 0,
            incorrect: 0,
            ties: 0,
            total: 0,
          };
        }

        const r = records.rankAccuracyAllTime[rank] as {
          correct: number;
          incorrect: number;
          ties: number;
          total: number;
        };
        r.correct += Number((data as any).correct) || 0;
        r.incorrect += Number((data as any).incorrect) || 0;
        r.ties += Number((data as any).ties) || 0;
        r.total += Number((data as any).total) || 0;
      });
    }

    // 2. Update Session Duration & Gameplay Records
    const turns = Number(currentGameStats.totalTurns) || 0;
    const rounds = Number(currentGameStats.totalRounds) || 0;

    if (turns > records.longestGameTurns) records.longestGameTurns = turns;
    if (
      records.shortestGameTurns === 0 ||
      (turns > 0 && turns < records.shortestGameTurns)
    )
      records.shortestGameTurns = turns;

    if (rounds > records.mostRounds) records.mostRounds = rounds;
    if (
      records.shortestGameRounds === 0 ||
      (rounds > 0 && rounds < records.shortestGameRounds)
    )
      records.shortestGameRounds = rounds;

    // 3. Ties Logic
    const currentTies = Number(currentGameStats.tiesWithDiscard) || 0;
    if (currentTies > (records.mostTiesInOneGame || 0))
      records.mostTiesInOneGame = currentTies;
    if (
      records.lowTiesInOneGame === undefined ||
      records.lowTiesInOneGame === null ||
      currentTies < records.lowTiesInOneGame
    ) {
      records.lowTiesInOneGame = currentTies;
    }

    // 3. Update Main Specialist Rows
    (["ace", "sabotage", "shield", "lucky7", "queen", "bounty"] as const).forEach(
      (key) => {
        const currentTotal = Number((s as any)[key]?.total) || 0;
        if (currentTotal > (records.mostSpecialistsInOneGame[key] || 0))
          records.mostSpecialistsInOneGame[key] = currentTotal;
        if (
          records.lowSpecialists[key] === null ||
          currentTotal < records.lowSpecialists[key]!
        )
          records.lowSpecialists[key] = currentTotal;
        records.totalSpecialistCounts[key] =
          (Number(records.totalSpecialistCounts[key]) || 0) + currentTotal;
      },
    );

    // 4. Update Discard Combo Stats
    if (currentGameStats.combos) {
      (["pair", "straight", "flush"] as const).forEach((key) => {
        const currentCount = Number(currentGameStats.combos[key]) || 0;
        if (currentCount > (records.mostCombosInOneGame[key] || 0))
          records.mostCombosInOneGame[key] = currentCount;
        if (
          records.lowCombosInOneGame[key] === null ||
          currentCount < records.lowCombosInOneGame[key]!
        )
          records.lowCombosInOneGame[key] = currentCount;
        records.totalComboCounts[key] =
          (Number(records.totalComboCounts[key]) || 0) + currentCount;
      });
    }

    // 5. Detailed Sub-Stats Logic
    const getRate = (success: number, total: number): number =>
      total > 0 ? Math.round((success / total) * 100) : 0;

    const currentSubResults = {
      aceSuccess: {
        rate: getRate(s.ace.success, s.ace.total),
        s: s.ace.success,
        a: s.ace.total,
      },
      lucky7Success: {
        rate: getRate(s.lucky7.success, s.lucky7.total),
        s: s.lucky7.success,
        a: s.lucky7.total,
      },
      queenGuessAccuracy: {
        rate: getRate(s.queen.colorSuccess, s.queen.colorTotal),
        s: s.queen.colorSuccess,
        a: s.queen.colorTotal,
      },
      sabotageCleared: {
        rate: getRate(s.sabotage.success, s.sabotage.total),
        s: s.sabotage.success || 0,
        a: s.sabotage.total,
      },
    };

    for (const [key, data] of Object.entries(currentSubResults)) {
      const subKey = key as keyof typeof currentSubResults;
      if (data.a > 0) {
        if (data.rate > records.subStats[subKey].high)
          records.subStats[subKey].high = data.rate;
        if (
          records.subStats[subKey].low === null ||
          data.rate < records.subStats[subKey].low!
        )
          records.subStats[subKey].low = data.rate;

        records.subStats[subKey].success += Number(data.s) || 0;
        records.subStats[subKey].attempts += Number(data.a) || 0;
      }
    }

    // --- QUEEN ROUND LENGTH TRACKING ---
    const roundLengths: number[] = s.queen?.roundLengths || [];
    if (roundLengths.length > 0) {
      const rl = records.subStats.queenRoundLength;
      roundLengths.forEach((len: number) => {
        if (rl.low === null || len < rl.low) rl.low = len;
        if (len > rl.high) rl.high = len;
        rl.totalGuesses += len;
        rl.totalRounds++;
      });
    }

    const declinedCount = Math.max(
      0,
      (Number(s.bounty.total) || 0) - (Number(s.bounty.accepted) || 0),
    );
    if (declinedCount > records.subStats.bountyDeclined.high)
      records.subStats.bountyDeclined.high = declinedCount;
    if (
      records.subStats.bountyDeclined.low === null ||
      declinedCount < records.subStats.bountyDeclined.low
    )
      records.subStats.bountyDeclined.low = declinedCount;
    records.subStats.bountyDeclined.total += declinedCount;

    records.subStats.bountyInstant.success += Number(s.bounty.instantWins) || 0;
    records.subStats.bountyInstant.totalAccepted +=
      Number(s.bounty.accepted) || 0;

    localStorage.setItem("BOUNTY_RECORDS", JSON.stringify(records));
    console.log("📊 RecordManager: Stats successfully merged and saved.");
    return records;
  },
};