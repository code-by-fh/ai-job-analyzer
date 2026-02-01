export interface Job {
    id: string;
    title: string;
    company: string;
    description: string;
    match_score: number;
    reasoning: string;
    url?: string;
    application_draft?: string;
    created_at?: string;
    status?: string;
    is_favorite?: boolean;
    generation_error?: string;
    user_id?: number;
}
