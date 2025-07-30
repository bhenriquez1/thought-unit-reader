export interface Chapter {
  id: string;
  title: string;
  content: string;
  page: number; // ✅ added this line
  pageStart?: number;
  pageEnd?: number;
}