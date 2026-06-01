import { describe, expect, it } from 'vitest';
import { decodeSteamOwnedGamesResponse } from '../src/lib/steam-owned-games-shape';

describe('decodeSteamOwnedGamesResponse', () => {
  it('normalizes valid owned games and skips malformed siblings', () => {
    expect(decodeSteamOwnedGamesResponse({
      response: {
        games: [
          { appid: 90001, name: 'Game A', playtime_forever: 120 },
          { appid: 90002, name: null, playtime_forever: 20 },
        ],
      },
    })).toEqual([{ appid: 90001, name: 'Game A', minutes: 120 }]);
  });

  it('preserves Steam empty-library response variants', () => {
    expect(decodeSteamOwnedGamesResponse({})).toEqual([]);
    expect(decodeSteamOwnedGamesResponse({ response: {} })).toEqual([]);
  });

  it('rejects malformed envelopes', () => {
    expect(decodeSteamOwnedGamesResponse(null)).toBeNull();
    expect(decodeSteamOwnedGamesResponse({ response: [] })).toBeNull();
    expect(decodeSteamOwnedGamesResponse({ response: { games: {} } })).toBeNull();
  });
});
