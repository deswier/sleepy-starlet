// Sleep norms by age in minutes
export interface SleepNorms {
  totalSleep: { min: number; max: number };
  nightSleep: { min: number; max: number };
  daySleep: { min: number; max: number };
  totalWake: { min: number; max: number };
  napsCount: { min: number; max: number };
  ww: { min: number; max: number };
}

export function getSleepNorms(months: number): SleepNorms {
  let totalSleep: { min: number; max: number };
  let nightSleep: { min: number; max: number };
  let daySleep: { min: number; max: number };
  let napsCount: { min: number; max: number };
  let totalWake: { min: number; max: number };

  if (months < 1) {
    totalSleep = { min: 16 * 60, max: 18 * 60 };
    nightSleep = { min: 5 * 60, max: 10 * 60 };
    daySleep = { min: 6 * 60, max: 14 * 60 };
    totalWake = { min: 6 * 60, max: 8 * 60 };
    napsCount = { min: 5, max: 7 };
  } else if (months < 2) {
    totalSleep = { min: 14 * 60, max: 20 * 60 };
    nightSleep = { min: 7 * 60, max: 10 * 60 };
    daySleep = { min: 5 * 60, max: 9 * 60 };
    totalWake = { min: 4 * 60, max: 10 * 60 };
    napsCount = { min: 4, max: 5 };
  } else if (months < 3) {
    totalSleep = { min: 14 * 60, max: 18 * 60 };
    nightSleep = { min: 8 * 60, max: 12 * 60 };
    daySleep = { min: 5 * 60, max: 9 * 60 };
    totalWake = { min: 6 * 60, max: 10 * 60 };
    napsCount = { min: 4, max: 5 };
  } else if (months < 4) {
    totalSleep = { min: 14 * 60, max: 17 * 60 };
    nightSleep = { min: 9 * 60, max: 12 * 60 };
    daySleep = { min: 4 * 60, max: 7 * 60 };
    totalWake = { min: 7 * 60, max: 10 * 60 };
    napsCount = { min: 3, max: 4 };
  } else if (months < 5) {
    totalSleep = { min: 14 * 60, max: 17 * 60 };
    nightSleep = { min: 9 * 60, max: 12 * 60 };
    daySleep = { min: 4 * 60, max: 5 * 60 };
    totalWake = { min: 7 * 60, max: 10 * 60 };
    napsCount = { min: 3, max: 4 };
  } else if (months < 7) {
    totalSleep = { min: 13 * 60, max: 16 * 60 };
    nightSleep = { min: 10 * 60, max: 12 * 60 };
    daySleep = { min: 3 * 60, max: 5 * 60 };
    totalWake = { min: 8 * 60, max: 11 * 60 };
    napsCount = { min: 3, max: 4 };
  } else if (months < 9) {
    totalSleep = { min: 13 * 60, max: 15 * 60 };
    nightSleep = { min: 10 * 60, max: 12 * 60 };
    daySleep = { min: 2 * 60, max: 4 * 60 };
    totalWake = { min: 9 * 60, max: 11 * 60 };
    napsCount = { min: 2, max: 3 };
  } else if (months < 12) {
    totalSleep = { min: 12 * 60, max: 15 * 60 };
    nightSleep = { min: 10 * 60, max: 12 * 60 };
    daySleep = { min: 2 * 60, max: 3 * 60 };
    totalWake = { min: 9 * 60, max: 12 * 60 };
    napsCount = { min: 2, max: 3 };
  } else if (months < 15) {
    totalSleep = { min: 12 * 60, max: 14 * 60 };
    nightSleep = { min: 10 * 60, max: 12 * 60 };
    daySleep = { min: 2 * 60, max: 3 * 60 };
    totalWake = { min: 10 * 60, max: 12 * 60 };
    napsCount = { min: 1, max: 2 };
  } else if (months < 18) {
    totalSleep = { min: 12 * 60, max: 14 * 60 };
    nightSleep = { min: 10 * 60, max: 12 * 60 };
    daySleep = { min: 1.5 * 60, max: 3 * 60 };
    totalWake = { min: 10 * 60, max: 12 * 60 };
    napsCount = { min: 1, max: 2 };
  } else if (months < 24) {
    totalSleep = { min: 12 * 60, max: 14 * 60 };
    nightSleep = { min: 10 * 60, max: 12 * 60 };
    daySleep = { min: 1.5 * 60, max: 3 * 60 };
    totalWake = { min: 10 * 60, max: 12 * 60 };
    napsCount = { min: 1, max: 1 };
  } else if (months < 36) {
    totalSleep = { min: 11 * 60, max: 14 * 60 };
    nightSleep = { min: 10 * 60, max: 12 * 60 };
    daySleep = { min: 1 * 60, max: 3 * 60 };
    totalWake = { min: 10 * 60, max: 13 * 60 };
    napsCount = { min: 1, max: 1 };
  } else if (months < 48) {
    totalSleep = { min: 11 * 60, max: 13 * 60 };
    nightSleep = { min: 10 * 60, max: 11 * 60 };
    daySleep = { min: 1 * 60, max: 2 * 60 };
    totalWake = { min: 11 * 60, max: 13 * 60 };
    napsCount = { min: 1, max: 1 };
  } else if (months < 84) {
    totalSleep = { min: 10 * 60, max: 13 * 60 };
    nightSleep = { min: 9.5 * 60, max: 11 * 60 };
    daySleep = { min: 1 * 60, max: 2 * 60 };
    totalWake = { min: 11 * 60, max: 14 * 60 };
    napsCount = { min: 0, max: 1 };
  } else if (months < 120) {
    totalSleep = { min: 10 * 60, max: 11 * 60 };
    nightSleep = { min: 10 * 60, max: 11 * 60 };
    daySleep = { min: 0, max: 0 };
    totalWake = { min: 13 * 60, max: 14 * 60 };
    napsCount = { min: 0, max: 0 };
  } else {
    totalSleep = { min: 9 * 60, max: 10 * 60 };
    nightSleep = { min: 8 * 60, max: 10 * 60 };
    daySleep = { min: 0, max: 0 };
    totalWake = { min: 14 * 60, max: 15 * 60 };
    napsCount = { min: 0, max: 0 };
  }

  const ww = { min: 0, max: 0 }; // Placeholder, will be computed separately
  return { totalSleep, nightSleep, daySleep, totalWake, napsCount, ww };
}
