import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createProgram } from '../src/cli.js';
import type { Collection } from '../src/types.js';
const empty: Collection = {source:'official-api',sourceUrl:'https://api.rakkoma.com/api/list/v1',projects:[],pagination:{page:null,nextPage:null,limit:10}};
test('CLIのJSON・引数の受け渡し・openのURL正規化',async()=>{
  let options: unknown, opened: string | undefined;
  const program=createProgram({listProjects:async o=>{options=o;return empty;}, searchProjects:async()=>empty,showProject:async()=>{throw new Error('unused');},open:async url=>{opened=url;}});
  const previous=console.log; const output:string[]=[]; console.log=(value)=>output.push(value);
  try { await program.parseAsync(['list','--limit','2','--min-profit','0','--json'],{from:'user'}); }
  finally {console.log=previous;}
  assert.equal((options as {limit:number}).limit,2);assert.equal((options as {minProfit:number}).minProfit,0);assert.deepEqual(JSON.parse(output[0]!),empty);
  await program.parseAsync(['open','123'],{from:'user'});assert.equal(opened,'https://rakkoma.com/project/detail/123');
});
test('不正入力はstdoutを汚さず非ゼロ終了する',()=>{
  for(const args of [['list','--limit','51','--json'],['search','--page','0'],['show','https://evil.test/project/detail/1'],['list','--min-price','-1'],['search','--status','bad']]) {
    const result=spawnSync(process.execPath,['--import','tsx','src/cli.ts',...args],{encoding:'utf8'});
    assert.notEqual(result.status,0);assert.equal(result.stdout,'');assert.ok(result.stderr.length>0);
  }
});
test('npm linkと同じシンボリックリンク経由でもCLIが起動する',()=>{
  const dir=mkdtempSync(join(tmpdir(),'rakko-cli-test-'));
  try {
    const bin=join(dir,'rakko'); symlinkSync(resolve('src/cli.ts'),bin);
    const result=spawnSync(process.execPath,['--import','tsx',bin,'--help'],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/Usage: rakko/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
