import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { frontend } from './helpers.mjs';

const seed = async (f, id = 'draft') => {
  f.context.draftId = id;
  await f.run("storeDraft({uploadId:draftId,bytes:new Uint8Array([1,2]),size:2,mimeType:'image/jpeg',mediaType:'photo',message:'',createdAt:Date.now()})");
};
test('draft selection survives reload and is never processed before explicit send', async () => {
  const db = new IDBFactory(), f = frontend(db); await seed(f);
  await f.run("processQueue('no consent yet')");
  assert.equal((await f.run('readPending()')).length, 0);
  assert.equal((await frontend(db).run('readDrafts()')).length, 1);
});
test('batch moves all selected drafts atomically and keeps names and individual captions', async () => {
  const f = frontend(); await seed(f, 'one'); await seed(f, 'two');
  await f.run("(async()=>{const item=(await readDrafts())[0];item.message='Légende personnelle';await storeDraft(item,true)})()");
  const items = await f.run("submitDrafts(['one','two'],'Invité Test','Légende commune')");
  assert.equal(items.length, 2); assert.equal((await f.run('readDrafts()')).length, 0);
  const pending = await f.run('readPending()');
  assert.equal(pending[0].guestName, 'Invité Test');
  assert.deepEqual(new Set(pending.map(item => item.message)), new Set(['Légende personnelle','Légende commune']));
});
test('simultaneous submissions in two tabs cannot enqueue a draft twice', async () => {
  const db = new IDBFactory(), a = frontend(db), b = frontend(db); await seed(a);
  const submitted = await Promise.all([a.run("submitDrafts(['draft'],'A','')"), b.run("submitDrafts(['draft'],'B','')")]);
  assert.equal(submitted.flat().length, 1); assert.equal((await a.run('readPending()')).length, 1);
});
test('simultaneous additions respect 20-file capacity across tabs', async () => {
  const db = new IDBFactory(), a = frontend(db), b = frontend(db);
  for (let i=0; i<19; i++) await seed(a, 'old-'+i);
  const result = await Promise.allSettled([seed(a, 'new-a'),seed(b, 'new-b')]);
  assert.equal(result.filter(item=>item.status==='fulfilled').length,1);
  assert.equal((await a.run('readDrafts()')).length,20);
});
test('32 MiB budget includes uploads pending receipt and never discards them', async () => {
  const f = frontend(); await f.run("queuePut({uploadId:'waiting',size:32*1024*1024,createdAt:Date.now()})");
  await assert.rejects(seed(f), /32 Mo/);
  assert.equal((await f.run('readPending()')).length,1);
});
test('editing replaces only an existing draft, keeping its stable identity', async () => {
  const f=frontend(); await seed(f);
  await f.run("(async()=>{const d=(await readDrafts())[0];d.message='Modifiée';await storeDraft(d,true)})()");
  assert.equal((await f.run('readDrafts()')).length,1);
  await f.run("submitDrafts(['draft'],'','')");
  await assert.rejects(f.run("storeDraft({uploadId:'draft',size:2},true)"), /déjà été/);
});
test('storage unavailable preserves editable drafts in memory and supports send', async () => {
  const f=frontend(); f.run("openQueueDb=async()=>{throw new Error('unavailable')}");
  await seed(f); assert.equal(f.run('memoryDrafts.size'),1);
  const items=await f.run("submitDrafts(['draft'],'Test','Mémoire')");
  assert.equal(items.length,1); assert.equal(f.run('memoryDrafts.size'),0); assert.equal(f.run('memoryQueue.size'),1);
});
test('removing a draft never removes a pending upload', async () => {
  const f=frontend(); await seed(f);
  await f.run("queuePut({uploadId:'waiting',size:1,createdAt:Date.now()})");
  await f.run("removeDraft('draft')");
  assert.equal((await f.run('readDrafts()')).length,0); assert.equal((await f.run('readPending()')).length,1);
});
test('batch confirmation waits for every receipt and exposes partial failures', async () => {
  const f=frontend(); f.run("state.doneBatchIds=['one','two'];receivedUploads.add('one')");
  await f.run("queuePut({uploadId:'two',status:'FAILED',createdAt:Date.now()});refreshPending()");
  assert.match(f.elements.get('doneText').textContent,/1 \/ 2/);
  assert.match(f.elements.get('doneTitle').textContent,/restent/);
  await f.run("completePending({uploadId:'one'});completePending({uploadId:'two'});refreshPending()");
  assert.equal(f.elements.get('doneTitle').textContent,'Souvenirs bien reçus');
});
test('filter originals count against local budget and are excluded from uploads', async () => {
  const f=frontend(); await seed(f);
  await f.run("(async()=>{const d=(await readDrafts())[0];d.originalBytes=new Uint8Array([3,4]);d.originalMimeType='image/jpeg';d.storageSize=4;await storeDraft(d,true)})()");
  const items = await f.run("submitDrafts(['draft'],'','')");
  assert.equal(items[0].originalBytes, undefined); assert.equal(items[0].storageSize, undefined);
  await f.run("queuePut({uploadId:'full',size:32*1024*1024-3,createdAt:Date.now()})");
  await assert.rejects(f.run("storeDraft({uploadId:'new',size:1,storageSize:4})"),/32 Mo/);
});
test('upgrading existing v2 storage retains unconfirmed old uploads', async () => {
  const db = new IDBFactory();
  await new Promise((resolve,reject)=>{
    const req=db.open('livre-souvenirs',2);
    req.onupgradeneeded=()=>{req.result.createObjectStore('file-attente',{keyPath:'uploadId'});req.result.createObjectStore('envoi-verrous',{keyPath:'key'});};
    req.onsuccess=()=>{const tx=req.result.transaction('file-attente','readwrite');tx.objectStore('file-attente').put({uploadId:'old-version',size:1});tx.oncomplete=()=>{req.result.close();resolve();};};req.onerror=()=>reject(req.error);
  });
  const f=frontend(db); await seed(f);
  assert.equal((await f.run('readPending()'))[0].uploadId,'old-version');
  assert.equal((await f.run('readDrafts()')).length,1);
});
test('missing queue items or unavailable storage never claim an unproven batch receipt', async () => {
  const f=frontend(); f.run("state.doneBatchIds=['unknown']"); await f.run('refreshPending()');
  assert.match(f.elements.get('doneText').textContent,/0 \/ 1/);
  f.run("openQueueDb=async()=>{throw Error('storage unavailable')}"); await f.run('refreshPending()');
  assert.match(f.elements.get('doneText').textContent,/0 \/ 1/);
});
test('receipts from a worker in another tab prove the whole batch was received', async () => {
  const db=new IDBFactory(), a=frontend(db), b=frontend(db); await seed(a);
  await a.run("submitDrafts(['draft'],'','');state.doneBatchIds=['draft']");
  await b.run("completePending({uploadId:'draft'})"); await a.run('refreshPending()');
  assert.equal(a.elements.get('doneTitle').textContent,'Souvenirs bien reçus');
});
