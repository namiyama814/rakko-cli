export interface Project {
  id: string; title: string; url: string; price: number | null;
  monthlySales: number | null; monthlyProfit: number | null; monthlyPv: number | null;
  publishedAt?: string; summary?: string;
}
export interface Collection {
  source: 'official-api' | 'html'; sourceUrl: string; projects: Project[];
  pagination: { page: number | null; nextPage: number | null; limit: number | null };
}
export interface Detail {
  source: 'html'; sourceUrl: string; project: Project;
  sections: Record<string, string>;
}
