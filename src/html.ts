import { load, type CheerioAPI } from 'cheerio';
import { z } from 'zod';
import { getText, RakkoError, type HttpOptions } from './http.js';
import { projectId, projectUrl, searchUrl, type SearchOptions } from './options.js';
import type { Collection, Detail, Project } from './types.js';
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
export function numberValue(text: string): number | null {
  const value = clean(text).replace(/[¥￥,\s]/g, '');
  return /^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) ? Number(value) : null;
}
export function parseSearch(html: string, sourceUrl: string): Collection {
  const $ = load(html), page = Number(new URL(sourceUrl).searchParams.get('page') ?? 1);
  const projects: Project[] = [];
  $('.project_list').each((_, node) => {
    const card = $(node), href = card.children('a[href*="/project/detail/"]').first().attr('href');
    if (!href) throw new RakkoError('検索結果のHTML構造が変更されています（案件URL）');
    const url = projectUrl(new URL(href, 'https://rakkoma.com').href);
    const title = clean(card.find('.project_list_name h3').text());
    const priceText = card.find('.project_list_price_item').first().text();
    if (!title || !card.find('.project_list_price').length) throw new RakkoError('検索結果のHTML構造が変更されています（案件情報）');
    const stats: Record<string, number | null> = {};
    card.find('.project_list_stat').each((_, stat) => {
      const label = clean($(stat).find('.project_list_stat_label').text());
      stats[label] = numberValue($(stat).find('.project_list_stat_value').first().text());
    });
    projects.push({ id:projectId(url), url, title, price:numberValue(priceText),
      monthlySales:stats['売上/月'] ?? null, monthlyProfit:stats['利益/月'] ?? null, monthlyPv:stats['PV/月'] ?? null,
      publishedAt:clean(card.find('.new-arrivals-text .date span').text()),
      summary:clean(card.find('.project_list_summary_text').text()),
    });
  });
  // An explicit empty-state marker prevents challenge/error pages from looking like empty results.
  if (!projects.length && !clean($('body').text()).includes('案件が見つかりませんでした。')) throw new RakkoError('検索結果のHTML構造が変更されているか、取得が制限されています');
  let nextPage: number | null = null;
  $('a[href*="page="]').each((_, a) => {
    try {
      const url = new URL($(a).attr('href')!, sourceUrl);
      if (url.origin === 'https://rakkoma.com' && url.pathname === '/project/list' && Number(url.searchParams.get('page')) === page + 1) nextPage = page + 1;
    } catch {}
  });
  return {source:'html',sourceUrl,projects,pagination:{page,nextPage,limit:null}};
}
const productSchema = z.object({
  '@type': z.literal('Product'), name:z.string().min(1), sku:z.union([z.string(),z.number()]).optional(),
  description:z.string().optional(), offers:z.object({price:z.union([z.number(),z.string()]).optional()}).passthrough().optional(),
}).passthrough();
function productData($: CheerioAPI) {
  let product: z.infer<typeof productSchema> | undefined;
  $('script[type="application/ld+json"]').each((_, script) => {
    let data: unknown;
    try { data = JSON.parse($(script).text()); } catch { throw new RakkoError('案件詳細のJSON-LDが不正です'); }
    const visit = (item: unknown) => {
      if (Array.isArray(item)) { item.forEach(visit); return; }
      if (!item || typeof item !== 'object') return;
      if ('@graph' in item) visit(item['@graph']);
      if ('@type' in item && item['@type'] === 'Product') {
        const result = productSchema.safeParse(item);
        if (!result.success) throw new RakkoError('案件詳細のJSON-LD形式が変更されています');
        product = result.data;
      }
    }; visit(data);
  });
  return product;
}
export function parseDetail(html: string, sourceUrl: string): Detail {
  const $ = load(html), id = projectId(sourceUrl), product = productData($);
  if (!$('h1.detail_ttl').length || !$('.detail_table1').length) throw new RakkoError('案件詳細のHTML構造が変更されているか、案件が非公開です');
  if (product?.sku !== undefined && String(product.sku) !== id) throw new RakkoError('案件詳細のIDが一致しません');
  const rows: Record<string, string> = {}, metrics: Record<string, number | null> = {};
  $('.detail_table1 tr').each((_, row) => {
    const th = $(row).find('th').first().clone(); th.find('.help_icon,.help_btn_wrap').remove();
    const label = clean(th.text()), td = $(row).find('td').first();
    rows[label] = clean(td.text());
    metrics[label] = numberValue(td.find('.txt_big,.project_list_price_item').first().text());
  });
  const title = product?.name ?? clean($('h1.detail_ttl').text());
  if (!title) throw new RakkoError('案件名を取得できませんでした');
  const sections: Record<string, string> = { '基本情報': Object.entries(rows).map(([k,v])=>`${k}: ${v}`).join('\n') };
  $('h2.div_ttl').each((_, heading) => {
    const name = clean($(heading).text());
    if (!['概要','収支','アクセスデータ','媒体情報','売買情報'].includes(name)) return;
    const section = $(heading).parent().clone();
    section.find('h2,script,style,.help_btn_wrap,.rakko_balloon,.help_icon').remove();
    section.find('br').replaceWith('\n');
    section.find('.detail_site_data_block').each((_, block)=> {
      const label = clean($(block).find('.detail_site_data_title').text());
      const value = clean($(block).find('.detail_site_data_content_detail').text());
      $(block).replaceWith(`${label}: ${value}\n`);
    });
    sections[name] = section.find('.project-detail-guest-mask').length ? '非公開（ログインが必要）' : section.text().split('\n').map(line=>clean(line)).filter(Boolean).join('\n');
  });
  return {source:'html',sourceUrl,project:{id,url:projectUrl(id),title,
    price:product?.offers?.price !== undefined ? numberValue(String(product.offers.price)) : metrics['希望売却価格'] ?? null,
    monthlySales:metrics['売上/月'] ?? null,monthlyProfit:metrics['利益/月'] ?? null,monthlyPv:metrics['PV/月'] ?? null,
    ...(product?.description ? {summary:product.description} : {}),
  },sections};
}
export async function searchProjects(keyword: string | undefined, options: SearchOptions = {}, http?: HttpOptions): Promise<Collection> {
  const url = searchUrl(keyword, options); return parseSearch(await getText(url,http), url);
}
export async function showProject(input: string, http?: HttpOptions): Promise<Detail> {
  const url = projectUrl(input); return parseDetail(await getText(url,http),url);
}
