import { RakkoError } from './http.js';
export const subtypes = { media: 101, ec: 102, service: 103, youtube: 201, amazon: 203, instagram: 204, app: 301, other: 399 } as const;
export const statuses = { all: 1, active: 6, sold: 9 } as const;
export const sorts = { newest: 1, 'price-desc': 2, 'price-asc': 3, sales: 4, profit: 5, pv: 6, recommended: 7, reduced: 8, negotiations: 11, views: 12, favorites: 13, followers: 14 } as const;
export function integer(value: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new RakkoError(`0以上の整数を指定してください: ${value}`);
  return Number(value);
}
export function projectId(value: string): string {
  if (/^[1-9]\d*$/.test(value)) return value;
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/project\/detail\/([1-9]\d*)\/?$/);
    if (url.protocol === 'https:' && url.hostname === 'rakkoma.com' && !url.port && !url.username && !url.password && match) return match[1]!;
  } catch {}
  throw new RakkoError('案件IDまたは https://rakkoma.com/project/detail/<id> を指定してください');
}
export function projectUrl(value: string): string { return `https://rakkoma.com/project/detail/${projectId(value)}`; }
export interface Filters { minPrice?: number; maxPrice?: number; minSales?: number; minProfit?: number; minPv?: number; subtype?: keyof typeof subtypes }
export interface ListOptions extends Filters { type?: string; limit?: number; keyword?: string }
export interface SearchOptions extends Filters { status?: keyof typeof statuses; sort?: keyof typeof sorts; page?: number }
export function listUrl(options: ListOptions): string {
  const url = new URL('https://api.rakkoma.com/api/list/v1');
  if (options.subtype === 'other') throw new RakkoError('other は公開検索のみ対応しています。search --subtype other を使ってください');
  if (options.keyword !== undefined && !options.keyword.trim()) throw new RakkoError('キーワードを空にはできません');
  const type = options.keyword ? 'related' : options.type ?? 'new';
  if (!['pickup', 'new', 'pickup+new', 'related', 'random', 'default'].includes(type)) throw new RakkoError('取得種別が不正です');
  if (type === 'related' && !options.keyword?.trim()) throw new RakkoError('relatedには --keyword が必要です');
  const limit = options.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new RakkoError('--limit は1〜50で指定してください');
  url.searchParams.set('type', type); url.searchParams.set('limit', String(limit));
  if (options.keyword) { if (options.keyword.length > 255) throw new RakkoError('キーワードは255文字以内です'); url.searchParams.set('keyword', options.keyword); }
  addFilters(url, options, {minPrice:'site_price', minSales:'site_sales', minProfit:'site_profit', minPv:'site_pv'});
  return url.href;
}
function addFilters(url: URL, options: Filters, mapping: Record<string, string>) {
  for (const [key, param] of Object.entries(mapping)) {
    const value = options[key as keyof Filters];
    if (value !== undefined) url.searchParams.set(param, String(value));
  }
  if (options.subtype) {
    if (!(options.subtype in subtypes)) throw new RakkoError('案件副種別が不正です');
    url.searchParams.set(url.hostname === 'api.rakkoma.com' ? 'sale_subtype' : 'sale_subtype[]', String(subtypes[options.subtype]));
  }
}
export function searchUrl(keyword: string | undefined, options: SearchOptions): string {
  if (options.minPrice !== undefined && options.maxPrice !== undefined && options.minPrice > options.maxPrice) throw new RakkoError('価格下限は上限以下で指定してください');
  const page = options.page ?? 1;
  if (!Number.isInteger(page) || page < 1) throw new RakkoError('--page は1以上で指定してください');
  const status = options.status ?? 'active', sort = options.sort ?? 'newest';
  if (!(status in statuses) || !(sort in sorts)) throw new RakkoError('状態または並び順が不正です');
  const url = new URL('https://rakkoma.com/project/list');
  if (keyword) url.searchParams.set('search_word', keyword);
  url.searchParams.set('sitesell_status', String(statuses[status]));
  url.searchParams.set('site_sort', String(sorts[sort])); url.searchParams.set('page', String(page));
  addFilters(url, options, { minPrice:'sitesell_value_from', maxPrice:'sitesell_value_to', minSales:'sitesell_sale_from', minProfit:'sitesell_profit_from', minPv:'sitesell_pv_from' });
  return url.href;
}
