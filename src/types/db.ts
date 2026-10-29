// 對應 supabase/migrations 的資料型別（階段 2 用到的部分，後續階段逐步補齊）

export type AppRole = "admin" | "member" | "viewer";
export type MemberPosition = "pi" | "postdoc" | "phd" | "master" | "undergrad" | "staff";
export type ProjectStatus = "planning" | "active" | "paused" | "completed";
export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type TaskPriority = "high" | "medium" | "low";
export type PublicationStage = "idea" | "drafting" | "submitted" | "revision" | "accepted" | "published";

export type Member = {
  id: string;
  user_id: string | null;
  name: string;
  name_en: string | null;
  email: string | null;
  avatar_url: string | null;
  position: MemberPosition;
  app_role: AppRole;
  is_alumni: boolean;
};

export type PageSetting = {
  key: string;
  emoji: string;
  title: string;
  title_en: string;
};
