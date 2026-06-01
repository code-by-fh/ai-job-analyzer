export interface Job {
  id: string;
  title: string;
  company: string;
  description: string;
  match_score: number;
  reasoning: string;
  url?: string;
  application_draft?: string;
  cv_draft?: string;
  cv_html?: string;
  cover_letter_html?: string;
  created_at?: string;
  status?: string;
  is_favorite?: boolean;
  is_archived?: boolean;
  generation_error?: string;
  user_id?: number;
  platform_id?: number;
  next_follow_up_at?: string;
  interview_prep_material?: string;
  company_domain?: string;
  notes?: string;
}

export interface DocumentTemplate {
  id: number;
  doc_type: "CV" | "COVER_LETTER";
  name: string;
  is_admin: boolean;
  user_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}
