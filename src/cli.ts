#!/usr/bin/env node
import { Command, Option } from 'commander';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { listProjects } from './api.js';
import { searchProjects, showProject } from './html.js';
import { integer, projectUrl, subtypes, statuses, sorts } from './options.js';
import { formatOutput } from './output.js';
import type { Collection, Detail } from './types.js';
export function createProgram(deps = { listProjects, searchProjects, showProject, open: async (url: string) => {
  if (process.platform !== 'darwin') throw new Error('open はmacOSで利用できます');
  await promisify(execFile)('open',[url]);
}}): Command {
  const program = new Command().name('rakko').description('ラッコM&Aの公開案件を取得').version('0.1.0').showHelpAfterError();
  const output = (data: Collection | Detail, options: {json?:boolean}) => console.log(formatOutput(data,!!options.json));
  function filters(cmd: Command) {
    return cmd.option('--min-price <yen>','価格下限',integer).option('--min-sales <yen>','月間売上下限',integer)
      .option('--min-profit <yen>','月間利益下限',integer).option('--min-pv <count>','月間PV下限',integer)
      .addOption(new Option('--subtype <type>','案件副種別').choices(Object.keys(subtypes)))
      .option('--json','JSONで出力');
  }
  filters(program.command('list').description('公式APIから案件一覧を取得'))
    .addOption(new Option('--type <type>','取得種別（キーワード指定時はrelated）').choices(['new','pickup','pickup+new','related','random','default']).default('new'))
    .option('--limit <count>','最大件数（1〜50）',integer,10).option('--keyword <word>','関連案件のキーワード')
    .action(async options=>output(await deps.listProjects(options),options));
  filters(program.command('search [keyword]').description('公開検索ページで案件を検索'))
    .option('--max-price <yen>','価格上限',integer)
    .addOption(new Option('--status <status>','all:全状態 / active:受付中 / sold:成約済み').choices(Object.keys(statuses)).default('active'))
    .addOption(new Option('--sort <order>','並び順').choices(Object.keys(sorts)).default('newest'))
    .option('--page <number>','ページ番号',integer,1)
    .action(async (keyword,options)=>output(await deps.searchProjects(keyword,options),options));
  program.command('show <id-or-url>').description('公開されている案件詳細を取得').option('--json','JSONで出力')
    .action(async (input,options)=>output(await deps.showProject(input),options));
  program.command('open <id-or-url>').description('案件を既定ブラウザで開く').action(async input=>deps.open(projectUrl(input)));
  return program;
}
export async function main(argv = process.argv): Promise<void> {
  try { await createProgram().parseAsync(argv); }
  catch (error) { console.error(`エラー: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await main();
