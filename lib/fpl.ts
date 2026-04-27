// Typed wrapper around the unofficial FPL public API.
// All endpoints are public, no auth header needed.

const FPL_BASE = "https://fantasy.premierleague.com/api";

export type FplEvent = {
  id: number;
  name: string;
  deadline_time: string; // ISO
  average_entry_score: number;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
  highest_score: number | null;
};

export type FplBootstrap = {
  events: FplEvent[];
  elements: FplElement[];
  teams: FplTeam[];
};

export type FplElement = {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  element_type: number; // 1=GK, 2=DEF, 3=MID, 4=FWD
  now_cost: number;
  total_points: number;
};

export type FplTeam = {
  id: number;
  name: string;
  short_name: string;
};

export type FplStandingsEntry = {
  entry: number;
  entry_name: string;
  player_name: string;
  total: number;
  event_total: number;
  rank: number;
  last_rank: number;
};

export type FplStandingsResponse = {
  league: { id: number; name: string };
  standings: {
    has_next: boolean;
    page: number;
    results: FplStandingsEntry[];
  };
};

export type FplHistoryEvent = {
  event: number;
  points: number; // already net of transfer hits
  total_points: number;
  rank: number;
  event_transfers: number;
  event_transfers_cost: number;
  points_on_bench: number;
};

export type FplHistory = {
  current: FplHistoryEvent[];
};

export type FplPicksEntry = {
  element: number;
  position: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
};

export type FplPicks = {
  active_chip: string | null;
  entry_history: {
    event: number;
    points: number;
    total_points: number;
    points_on_bench: number;
    event_transfers_cost: number;
  };
  picks: FplPicksEntry[];
};

async function fplFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${FPL_BASE}${path}`, {
    headers: { "user-agent": "fpl-league-dashboard/0.1" },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`FPL ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function getBootstrap(): Promise<FplBootstrap> {
  return fplFetch<FplBootstrap>("/bootstrap-static/");
}

export async function getLeagueStandings(leagueId: number): Promise<FplStandingsEntry[]> {
  const out: FplStandingsEntry[] = [];
  let page = 1;
  while (true) {
    const data = await fplFetch<FplStandingsResponse>(
      `/leagues-classic/${leagueId}/standings/?page_standings=${page}`,
    );
    out.push(...data.standings.results);
    if (!data.standings.has_next) break;
    page++;
    if (page > 20) break; // hard safety stop — 1000 entries
  }
  return out;
}

export function getEntryHistory(entryId: number): Promise<FplHistory> {
  return fplFetch<FplHistory>(`/entry/${entryId}/history/`);
}

export function getEntryPicks(entryId: number, gw: number): Promise<FplPicks> {
  return fplFetch<FplPicks>(`/entry/${entryId}/event/${gw}/picks/`);
}
