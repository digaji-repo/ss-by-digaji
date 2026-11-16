export interface PasteItem {
  id: string;
  room_id: string;
  title: string;
  content: string;
  syntax_language: string;
  created_at: string;
  updated_at: string;
}

export interface SavePastePayload {
  title: string;
  content: string;
  syntax_language: string;
}
