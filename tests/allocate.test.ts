import { describe, expect, it } from 'vitest';
import { allocateSeats } from '../src/engine/allocate';

describe('allocateSeats', () => {
  it('reproduces the official 2023 general election allocation', () => {
    // Final party votes: NAT, LAB, GRN, ACT, NZF, TPM, TOP, Other
    const votes = [1_085_851, 767_540, 330_907, 246_473, 173_553, 87_844, 63_344, 97_000];
    const electorates = [43, 17, 3, 2, 0, 6, 0, 0];
    const eligible = [true, true, true, true, true, true, true, false];
    const r = allocateSeats(votes, electorates, eligible);
    expect(Array.from(r.seats)).toEqual([48, 34, 15, 11, 8, 6, 0, 0]);
    expect(r.overhang).toBe(2);
    expect(r.houseSize).toBe(122);
  });

  it('excludes parties under 5% without an electorate', () => {
    const r = allocateSeats([50, 45, 4.9], [0, 0, 0], [true, true, true]);
    expect(r.seats[2]).toBe(0);
    expect(r.seats[0] + r.seats[1]).toBe(120);
  });

  it('gives an electorate-winning party below 5% its proportional share', () => {
    const r = allocateSeats([48, 48, 4], [0, 0, 1], [true, true, true]);
    expect(r.seats[2]).toBe(5);
    expect(r.houseSize).toBe(120);
  });

  it('removes seats won by independents from the list pool', () => {
    const r = allocateSeats([50, 50], [0, 0], [true, true], 1);
    expect(r.seats[0] + r.seats[1]).toBe(119);
    expect(r.houseSize).toBe(120);
  });

  it('creates overhang when electorates exceed entitlement', () => {
    const r = allocateSeats([60, 39, 1], [0, 0, 3], [true, true, true]);
    expect(r.seats[2]).toBe(3);
    expect(r.overhang).toBe(2);
    expect(r.seats[0] + r.seats[1]).toBe(119);
  });
});
