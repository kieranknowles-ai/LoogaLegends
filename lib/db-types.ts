// Hand-written types matching supabase/migrations/0001_init.sql.
// Replace later with `supabase gen types typescript` if you set up the CLI.

export type Player = {
  entry_id: number;
  user_id: string | null;
  display_name: string;
  is_admin: boolean;
  joined_at: string;
};

export type GameweekResult = {
  gw: number;
  entry_id: number;
  points: number;
  national_average: number;
  loser_fine_p: number;
  below_avg_fine_p: number;
};

export type FineKind = "gloat" | "missed_report";

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
};
