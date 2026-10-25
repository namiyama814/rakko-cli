import { z } from 'zod';
import { getText, RakkoError, type HttpOptions } from './http.js';
import { listUrl, projectId, projectUrl, type ListOptions } from './options.js';
import type { Collection } from './types.js';
const responseSchema = z.object({ success: z.literal(true), data: z.array(z.object({
  project_title: z.string().min(1), publish_date: z.string(), site_price: z.number().finite(),
  site_sales: z.number().finite(), site_profit: z.number().finite(), site_pv: z.number().finite(), site_url: z.string(),
})) });
export async function listProjects(options: ListOptions = {}, http?: HttpOptions): Promise<Collection> {
  const sourceUrl = listUrl(options);
  let value: unknown;
  try { value = JSON.parse(await getText(sourceUrl, http)); }
  catch (error) { if (error instanceof RakkoError) throw error; throw new RakkoError('公式APIのJSONが不正です'); }
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) throw new RakkoError('公式APIのレスポンス形式が変更されたか、取得に失敗しました');
  return { source:'official-api', sourceUrl, pagination:{page:null,nextPage:null,limit:options.limit ?? 10}, projects:parsed.data.data.map(p=>({
    id:projectId(p.site_url), url:projectUrl(p.site_url), title:p.project_title, price:p.site_price,
    monthlySales:p.site_sales, monthlyProfit:p.site_profit, monthlyPv:p.site_pv, publishedAt:p.publish_date,
  })) };
}
