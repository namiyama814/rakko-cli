import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getText } from '../src/http.js';
import { listUrl, searchUrl, projectId, projectUrl, integer } from '../src/options.js';
import { listProjects } from '../src/api.js';
import { parseSearch, parseDetail, searchProjects, showProject, numberValue } from '../src/html.js';
import { formatOutput } from '../src/output.js';
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.html`,import.meta.url),'utf8');
const fake = (body: string, status = 200) => (async () => new Response(body,{status})) as typeof fetch;
const apiBody = JSON.stringify({success:true,data:[{project_title:'テスト',publish_date:'2026-10-01 00:00:00',site_price:100,site_sales:0,site_profit:0,site_pv:0,site_url:'https://rakkoma.com/project/detail/123'}]});
test('公式APIの条件とrelated指定',()=>{
  const q = new URL(listUrl({keyword:'テスト',type:'new',limit:50,minPrice:0,minSales:10,minProfit:20,minPv:30,subtype:'youtube'})).searchParams;
  assert.equal(q.get('type'),'related'); assert.equal(q.get('site_price'),'0'); assert.equal(q.get('site_sales'),'10'); assert.equal(q.get('site_profit'),'20'); assert.equal(q.get('site_pv'),'30'); assert.equal(q.get('sale_subtype'),'201'); assert.equal(q.get('limit'),'50');
  assert.equal(new URL(listUrl({})).searchParams.get('type'),'new');
  for(const limit of [0,51,1.5]) assert.throws(()=>listUrl({limit}));
  assert.throws(()=>listUrl({type:'related'})); assert.throws(()=>integer('-1')); assert.throws(()=>integer('1.1'));
});
test('検索条件・状態・並び順・ページ指定',()=>{
  const q = new URL(searchUrl('テスト',{minPrice:10,maxPrice:20,minSales:1,minProfit:2,minPv:3,subtype:'media',status:'sold',sort:'price-asc',page:2})).searchParams;
  assert.deepEqual(Object.fromEntries(q),{search_word:'テスト',sitesell_status:'9',site_sort:'3',page:'2',sitesell_value_from:'10',sitesell_value_to:'20',sitesell_sale_from:'1',sitesell_profit_from:'2',sitesell_pv_from:'3','sale_subtype[]':'101'});
  assert.equal(new URL(searchUrl(undefined,{})).searchParams.get('sitesell_status'),'6');
  assert.throws(()=>searchUrl(undefined,{page:0})); assert.throws(()=>searchUrl(undefined,{minPrice:2,maxPrice:1}));
});
test('ID・URLは対象ホストのみ許可しURLを正規化',()=>{
  assert.equal(projectUrl('123'),'https://rakkoma.com/project/detail/123'); assert.equal(projectId('https://rakkoma.com/project/detail/123?r=abc'),'123');
  for(const s of ['0','-1','https://evil.test/project/detail/123','https://rakkoma.com.evil.test/project/detail/123','https://user@rakkoma.com/project/detail/123','http://rakkoma.com/project/detail/123','https://rakkoma.com:444/project/detail/123','https://rakkoma.com/login']) assert.throws(()=>projectId(s));
});
test('APIのゼロを保持し取得元と上限を返す',async()=>{
  const result = await listProjects({}, {fetch:fake(apiBody)});
  assert.equal(result.projects[0]?.monthlySales,0); assert.equal(result.source,'official-api'); assert.equal(result.pagination.limit,10);
  assert.deepEqual((await listProjects({}, {fetch:fake('{"success":true,"data":[]}')})).projects,[]);
  for(const body of ['no json','{"success":false}','{"success":true,"data":[{}]}']) await assert.rejects(listProjects({}, {fetch:fake(body)}));
});
test('検索HTMLは不明とゼロを区別し次ページを返す',async()=>{
  const result = await searchProjects('テスト',{}, {fetch:fake(fixture('search'))});
  assert.equal(result.projects[0]?.monthlySales,0); assert.equal(result.projects[0]?.monthlyProfit,null); assert.equal(result.projects[0]?.monthlyPv,1234); assert.equal(result.pagination.nextPage,2);
  assert.equal(numberValue('不明'),null); assert.equal(numberValue(''),null); assert.equal(numberValue('-1,000'),-1000);
  assert.equal(parseSearch('<p>案件が見つかりませんでした。</p>','https://rakkoma.com/project/list?page=2').projects.length,0);
  assert.throws(()=>parseSearch('<h1>アクセス制限</h1>','https://rakkoma.com/project/list'));
  assert.throws(()=>parseSearch(fixture('search').replace('project_list_name','changed'),'https://rakkoma.com/project/list'));
});
test('詳細はJSON-LDを優先し本文・非公開情報を保持',async()=>{
  const result = await showProject('123',{fetch:fake(fixture('detail'))});
  assert.equal(result.project.title,'構造化された案件名'); assert.equal(result.project.price,100000); assert.equal(result.project.monthlySales,0); assert.equal(result.project.monthlyProfit,null);
  assert.equal(result.sections['概要'],'テスト本文\n次の行'); assert.match(result.sections['基本情報']!,/交渉開始後開示/); assert.equal(result.sections['収支'],'非公開（ログインが必要）');
  assert.equal(result.sections['媒体情報'],'記事数: 10'); assert.equal(result.sections['売買情報'],'売却理由: 事業整理');
  assert.throws(()=>parseDetail('<h1>非公開</h1>',projectUrl('123')));
  assert.throws(()=>parseDetail(fixture('detail').replace('"sku":"123"','"sku":"999"'),projectUrl('123')));
  assert.throws(()=>parseDetail(fixture('detail').replace('"@context"','oops "@context"'),projectUrl('123')));
  const fallback = parseDetail(fixture('detail').replace(/<script[\s\S]*?<\/script>/,''),projectUrl('123'));
  assert.equal(fallback.project.title,'HTMLの案件名'); assert.equal(fallback.project.price,90000);
});
test('HTTPの再試行回数とRetry-After',async()=>{
  let calls = 0; const delays: number[] = [];
  const fetch = (async()=>{calls++;return calls < 3 ? new Response('',{status:429,headers:{'Retry-After':'1'}}):new Response('ok');}) as typeof globalThis.fetch;
  assert.equal(await getText('https://rakkoma.com',{fetch,sleep:async ms=>{delays.push(ms);}}),'ok'); assert.equal(calls,3); assert.deepEqual(delays,[1000,1000]);
  calls=0; await assert.rejects(getText('https://rakkoma.com',{fetch: (async()=>{calls++;return new Response('',{status:503});}) as typeof globalThis.fetch,sleep:async()=>{}}),/HTTP 503/); assert.equal(calls,3);
});
test('404・タイムアウト・ネットワーク失敗は再試行しない',async()=>{
  for(const error of [404,'TimeoutError','TypeError']) {
    let calls=0;
    const fetch = (async()=>{calls++;if(typeof error==='number')return new Response('',{status:error});throw new DOMException('failure',error);}) as typeof globalThis.fetch;
    await assert.rejects(getText('https://rakkoma.com',{fetch}),typeof error==='number'?/HTTP 404/:error==='TimeoutError'?/タイムアウト/:/通信に失敗/); assert.equal(calls,1);
  }
});
test('JSON出力と日本語表示・端末制御文字の除去',()=>{
  const data=parseSearch(fixture('search'),'https://rakkoma.com/project/list');
  assert.deepEqual(JSON.parse(formatOutput(data,true)),data); assert.match(formatOutput(data,false),/不明/); assert.match(formatOutput(data,false),/--page 2/);
  data.projects[0]!.title='テスト\u001b[31m'; assert.ok(!formatOutput(data,false).includes('\u001b'));
});
