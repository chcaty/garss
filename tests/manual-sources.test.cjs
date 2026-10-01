const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let planManualSources, prepareSourceProposal, validateSourceProposal, wireFetchControls;
before(async()=>{
  ({planManualSources}=await import('../scripts/lib/manual-sources.mjs'));
  ({prepareSourceProposal,validateSourceProposal}=await import('../docs/assets/review/source-proposal.mjs'));
  ({wireFetchControls}=await import('../docs/assets/review/fetch-controls.mjs'));
});
const proposal=()=>({schema_version:'1.0',title:'Example',description:'Description',category:'博客',feed_url:'https://example.com/feed',submitted_at:'2026-10-02T00:00:00Z'});
test('manual proposals add stable sources, preserve IDs and replay without duplicates',()=>{
  const input={schema_version:'1.0',sources:[]};
  const planned=planManualSources(input,[{name:'source.json',payload:proposal()}]);
  assert.equal(planned.added,1);
  assert.match(planned.sources.sources[0].id,/^M[a-f0-9]{20}$/);
  assert.deepEqual(input.sources,[]);
  const replay=planManualSources(planned.sources,[{name:'source.json',payload:{...proposal(),feed_url:'http://example.com/feed/'}}]);
  assert.equal(replay.added,0);
  assert.equal(replay.sources.sources[0].id,planned.sources.sources[0].id);
});
test('invalid source proposal cannot partially mutate a catalog',()=>{
  const input={schema_version:'1.0',sources:[]};
  assert.throws(()=>planManualSources(input,[{name:'first.json',payload:proposal()},{name:'bad.json',payload:{...proposal(),feed_url:'javascript:alert(1)'}}]));
  assert.deepEqual(input.sources,[]);
  assert.throws(()=>validateSourceProposal({...proposal(),extra:true}));
  assert.throws(()=>validateSourceProposal({...proposal(),feed_url:'https://name:password@example.com/feed'}));
});
test('manual form produces a GitHub proposal rather than auto-approving content',()=>{
  const prepared=prepareSourceProposal(proposal(),new Date('2026-10-02T00:00:00Z'));
  const url=new URL(prepared.url);
  assert.match(url.searchParams.get('filename'),/^source-proposals\//);
  assert.deepEqual(JSON.parse(url.searchParams.get('value')),{...proposal(),submitted_at:'2026-10-02T00:00:00.000Z'});
  assert.equal(JSON.parse(prepared.content).status,undefined);
});
test('manual fetch opens the authenticated workflow UI and refreshes last publication date',async()=>{
  const nodes=new Map();
  const byId=(id)=>{if(!nodes.has(id))nodes.set(id,{textContent:'',addEventListener(name,fn){this[name]=fn;}});return nodes.get(id);};
  const opened=[];
  wireFetchControls({byId,window:{open:(url)=>opened.push(url)},fetch:async()=>({ok:true,json:async()=>({api_version:'1.0',generated_at:'2026-10-02T00:00:00Z'})})});
  await byId('refresh-fetch-status').click();
  assert.match(byId('fetch-status').textContent,/最近发布/);
  byId('trigger-fetch').click();
  assert.match(opened[0],/actions\/workflows\/build-and-deploy.yml$/);
  assert.match(byId('fetch-status').textContent,/Run workflow/);
});
test('processed manual proposals cannot resurrect deleted sources or change historical submissions',()=>{
  const planned=planManualSources({schema_version:'1.0',sources:[]},[{name:'source.json',payload:proposal()}]);
  const replay=planManualSources({schema_version:'1.0',sources:[]},[{name:'source.json',payload:proposal()}],planned.ledger);
  assert.equal(replay.added,0);
  assert.throws(()=>planManualSources(planned.sources,[{name:'source.json',payload:{...proposal(),title:'Changed'}}],planned.ledger));
});
