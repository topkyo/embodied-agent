export type SustainedEpisodeSnapshot = {
  streak_minutes: number;
  episode_started_at?: string;
  l1_sent_at?: string;
  l1_reserved_at?: string;
  l2_sent_at?: string;
};

export function nextSustainedEpisodeTick(
  previous: SustainedEpisodeSnapshot | undefined,
  breaching: boolean,
  nowIso: string,
): SustainedEpisodeSnapshot {
  if (!breaching) {
    return { streak_minutes: 0 };
  }
  return {
    streak_minutes: (previous?.streak_minutes ?? 0) + 1,
    episode_started_at: previous?.episode_started_at ?? nowIso,
    l1_sent_at: previous?.l1_sent_at,
    l1_reserved_at: previous?.l1_reserved_at,
    l2_sent_at: previous?.l2_sent_at,
  };
}

export function isSustainedThresholdMet(
  episode: SustainedEpisodeSnapshot,
  minStreakMinutes: number,
  breaching: boolean,
): boolean {
  return breaching && episode.streak_minutes >= minStreakMinutes;
}

export function shouldEvaluateSustainedL1(
  episode: SustainedEpisodeSnapshot,
  minStreakMinutes: number,
  breaching: boolean,
): boolean {
  return (
    isSustainedThresholdMet(episode, minStreakMinutes, breaching) &&
    !episode.l1_sent_at &&
    !episode.l1_reserved_at
  );
}

export function shouldEvaluateSustainedL2(
  episode: SustainedEpisodeSnapshot,
  hasL2Plan: boolean,
): boolean {
  return hasL2Plan && Boolean(episode.l1_sent_at) && !episode.l2_sent_at;
}
