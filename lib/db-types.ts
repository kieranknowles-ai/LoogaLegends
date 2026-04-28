// Hand-written types matching supabase/migrations/0001_init.sql.
// Replace later with `supabase gen types typescript` if you set up the CLI.

export type Player = {
  entry_id: number;
  user_id: string | null;
  display_name: string;
  first_name: string | null;
  password_hash: string | null;
  is_admin: boolean;
  joined_at: string;
  bio: string | null;
  ai_caught_count: number;
};

export type GameweekResult = {
  gw: number;
  entry_id: number;
  points: number;
  national_average: number;
  loser_fine_p: number;
  below_avg_fine_p: number;
  event_transfers: number;
  event_transfers_cost: number;
  bank: number;
  squad_value: number;
};

export type FineKind = "gloat" | "missed_report" | "emoji";

export type GloatReason =
  | "general_arrogance"
  | "league_position"
  | "weekly_performance"
  | "non_football";

export const GLOAT_REASON_LABELS: Record<GloatReason, string> = {
  general_arrogance: "General arrogance",
  league_position: "League position",
  weekly_performance: "Weekly performance",
  non_football: "Non-football related",
};

export type FineProposal = {
  id: number;
  kind: FineKind;
  target_entry: number;
  gw: number | null;
  fine_p: number;
  note: string | null;
  proposed_by: number;
  proposed_at: string;
  seconded_by: number | null;
  seconded_at: string | null;
  voided: boolean;
  voided_reason: string | null;
  gloat_date: string | null;
  gloat_reason: GloatReason | null;
  emoji: string | null;
};

export const EMOJI_FINE_P = 50; // 50p per emoji used.

export const COMMON_EMOJIS = [
  "😂", "🤣", "😅", "😭", "🤔", "👀", "💀", "🫡",
  "🔥", "💪", "🏆", "🤷", "🙌", "🥳", "💯", "🤡",
  "😎", "🫠", "🙄", "👏",
];
