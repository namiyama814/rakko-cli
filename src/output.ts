import type { Collection, Detail, Project } from './types.js';
const safe = (s: string) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
const amount = (v: number | null, yen = true) => v === null ? '不明' : `${yen ? '¥' : ''}${v.toLocaleString('ja-JP')}`;
function project(p: Project): string {
  return `${p.id}  ${safe(p.title)}\n価格 ${amount(p.price)} / 売上/月 ${amount(p.monthlySales)} / 利益/月 ${amount(p.monthlyProfit)} / PV/月 ${amount(p.monthlyPv,false)}\n${p.url}`;
}
export function formatOutput(value: Collection | Detail, json: boolean): string {
  if (json) return JSON.stringify(value,null,2);
  if ('projects' in value) return [
    value.source === 'official-api' ? `公式API / ${value.projects.length}件（最大${value.pagination.limit}件、全件取得ではありません）` : `検索 / ${value.pagination.page}ページ / ${value.projects.length}件`,
    ...value.projects.map(project),
    ...(!value.projects.length ? ['案件が見つかりませんでした。'] : []),
    ...(value.pagination.nextPage ? [`次のページ: --page ${value.pagination.nextPage}`] : []),
  ].join('\n\n');
  return [project(value.project), value.project.summary ? `要約\n${safe(value.project.summary)}` : '', ...Object.entries(value.sections).map(([k,v])=>`${k}\n${safe(v)}`)].filter(Boolean).join('\n\n');
}
