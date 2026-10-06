// MMP seat allocation as set out in the Electoral Act 1993 (s 191–193).
//
// 1. A party qualifies for list seats if it wins ≥5% of the party vote or at
//    least one electorate.
// 2. Electorates won by independents (or unregistered parties) are deducted
//    from the 120 seats before the list allocation.
// 3. The remaining seats are shared between qualifying parties by the
//    Sainte-Laguë method using party votes.
// 4. A party that wins more electorates than its entitlement keeps them all;
//    the extra seats are overhang and enlarge the House. Other parties'
//    entitlements are not reduced.

export interface AllocationResult {
  /** Total seats for each party (index-aligned with the input). */
  seats: Int32Array;
  houseSize: number;
  overhang: number;
}

/**
 * @param votes        Party-vote share or count per party.
 * @param electorates  Electorates won by each party.
 * @param eligible     Parties allowed to receive seats (false for "Other").
 * @param independents Electorates won by candidates outside any listed party.
 */
export function allocateSeats(
  votes: ArrayLike<number>,
  electorates: ArrayLike<number>,
  eligible: ArrayLike<boolean>,
  independents = 0,
  totalSeats = 120,
  threshold = 0.05,
): AllocationResult {
  const n = votes.length;
  let totalVote = 0;
  for (let i = 0; i < n; i++) totalVote += votes[i];

  const qualifies: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    qualifies[i] = eligible[i] && (votes[i] / totalVote >= threshold - 1e-12 || electorates[i] > 0);
  }

  const toAllocate = totalSeats - independents;
  const entitlement = new Int32Array(n);
  // Sainte-Laguë: repeatedly award the seat to the highest quotient v / (2s + 1).
  // Ties go to the party with more votes (the Act uses a lot; this is deterministic).
  for (let k = 0; k < toAllocate; k++) {
    let best = -1;
    let bestQ = -1;
    for (let i = 0; i < n; i++) {
      if (!qualifies[i]) continue;
      const q = votes[i] / (2 * entitlement[i] + 1);
      if (q > bestQ || (q === bestQ && best >= 0 && votes[i] > votes[best])) {
        bestQ = q;
        best = i;
      }
    }
    if (best < 0) break;
    entitlement[best]++;
  }

  const seats = new Int32Array(n);
  let overhang = 0;
  for (let i = 0; i < n; i++) {
    if (!eligible[i]) continue;
    if (electorates[i] > entitlement[i]) {
      overhang += electorates[i] - entitlement[i];
      seats[i] = electorates[i];
    } else {
      seats[i] = entitlement[i];
    }
  }
  return { seats, houseSize: totalSeats + overhang, overhang };
}
