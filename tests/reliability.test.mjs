import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { frontend, backend, stream } from './helpers.mjs';

test('a retaken photo never reuses a same-size photo from cache', async () => {
  const f = frontend(); f.run("state.filters=[{id:'none',type:'none',mediaTypes:['photo']}];setCapturedMedia(new Blob(['AAAA'],{type:'image/jpeg'}),'photo',1200,800,0)");
  await f.run('buildFinalMedia(true)'); f.run("setCapturedMedia(new Blob(['BBBB'],{type:'image/jpeg'}),'photo',1200,800,0)");
  assert.equal(await (await f.run('buildFinalMedia(true)')).blob.text(), 'BBBB');
});
test('late microphone permission is disposed after leaving capture', async () => {
  const f = frontend(), audio = stream(); let resolve; f.context.navigator.mediaDevices.getUserMedia = () => new Promise(r => resolve = r);
  const pending = f.run('ensureAudioStream()'); f.run('stopAllStreams()'); resolve(audio); await pending;
  assert.equal(audio.track.stopped, true); assert.equal(f.run('state.audioStream'), null);
});
test('late camera permission is disposed after leaving capture', async () => {
  const f = frontend(), video = stream(); let resolve; f.context.navigator.mediaDevices.getUserMedia = () => new Promise(r => resolve = r);
  const pending = f.run('startCamera()'); f.run("stopAllStreams();showScreen('home')"); resolve(video); await pending;
  assert.equal(video.track.stopped, true); assert.equal(f.run('state.videoStream'), null);
});
test('camera change releases exclusive hardware and verifies actual facing', async () => {
  const f = frontend(), old = stream(); f.context.original = old; f.run('state.videoStream=original;state.cameraReady=true');
  f.context.navigator.mediaDevices.getUserMedia = async () => { if (!old.track.stopped) throw Object.assign(Error(), { name: 'NotReadableError' }); return stream('environment'); };
  await f.run('switchCamera()'); assert.equal(f.run('state.facingMode'), 'environment'); assert.equal(f.run('state.cameraReady'), true);
});
test('missing rear camera never announces a successful rear switch', async () => {
  const f = frontend(), old = stream(); f.context.original = old; f.run('state.videoStream=original;state.cameraReady=true');
  f.context.navigator.mediaDevices.getUserMedia = async () => stream('user'); await f.run('switchCamera()');
  assert.equal(f.run('state.facingMode'), 'user'); assert.equal(old.track.stopped, false);
});
test('rapid repeated camera switch requests are serialized', async () => {
  const f = frontend(); f.context.original = stream(); f.run('state.videoStream=original;state.cameraReady=true');
  let count = 0, resolve; f.context.navigator.mediaDevices.getUserMedia = () => { count++; return new Promise(r => resolve = r); };
  const first = f.run('switchCamera()'); await f.run('switchCamera()'); assert.equal(count, 1); resolve(stream('environment')); await first;
});
test('torch state starts from the actual new track, front camera offers screen light', () => {
  const f = frontend(); f.context.video = stream('environment', true); f.run("state.videoStream=video;state.torchOn=true;setupTorchButton()"); assert.equal(f.run('state.torchOn'), false);
  f.context.video = stream(); f.run("state.videoStream=video;state.facingMode='user';setupTorchButton()"); assert.equal(f.elements.get('btnTorch').hidden, false);
});
test('tapping a photo cannot hide send/save controls', () => {
  const f = frontend(); f.run("el.filterStrip.parentElement=el.screenPreview;state.mediaType='photo'");
  const stage = f.elements.get('mediaStage'); stage.listeners.pointerdown[0]({ clientX: 20, clientY: 20 }); stage.listeners.pointerup[0]({ clientX: 20, clientY: 20 });
  assert.equal(f.run("el.screenPreview.classList.contains('is-peeking')"), false);
});
test('preview preserves the media aspect ratio', () => {
  const f = frontend(); f.run("state.mediaWidth=1200;state.mediaHeight=800;fitMediaBox()");
  const box = f.elements.get('mediaBox'); assert.equal(parseInt(box.style.width) / parseInt(box.style.height), 1.5);
});
test('queue retains more than five memories and items older than 24h', async () => {
  const f = frontend(); await f.run("Promise.all(Array.from({length:8},(_,i)=>queuePut({uploadId:'item-'+i,createdAt:Date.now()-48*3600000-i})))");
  await f.run('queueTrim()'); assert.equal((await f.run('queueAll()')).length, 8);
});
test('two tabs cannot own the upload lease simultaneously', async () => {
  const db = new IDBFactory(), a = frontend(db), b = frontend(db);
  const results = await Promise.all([a.run('claimUploadLease(false)'), b.run('claimUploadLease(false)')]); assert.equal(results.filter(Boolean).length, 1);
  const owner = results[0] ? a : b, other = results[0] ? b : a;
  await owner.run('claimUploadLease(true)'); assert.equal(await other.run('claimUploadLease(false)'), true); await other.run('claimUploadLease(true)');
});
test('160 queued guests survive a retry burst; all are confirmed once', async () => {
  const f = frontend(); f.run("blobToBase64=async()=>'';var attemptsById=new Map();postMedia=async(url,text)=>{const p=JSON.parse(text);const n=(attemptsById.get(p.uploadId)||0)+1;attemptsById.set(p.uploadId,n);return {ok:true,data:n===1?{status:'RETRY',retryAfter:1}:{status:'COMPLETED'}}};checkStatusOnce=async()=>({status:'PENDING'});");
  await f.run("Promise.all(Array.from({length:160},(_,i)=>queuePut({uploadId:'guest-'+i,createdAt:Date.now(),bytes:new Uint8Array([1]),mimeType:'image/jpeg',filename:'guest.jpg',attempts:0})))");
  await f.run("processQueue('160 invités')"); assert.equal((await f.run('queueAll()')).length, 160);
  await f.run("(async()=>{for(const i of await queueAll()){i.nextAttemptAt=0;await queuePut(i)}})()");
  await f.run("processQueue('reprise')"); assert.equal((await f.run('queueAll()')).length, 0); assert.equal(f.run('[...attemptsById.values()].every(n=>n===2)'), true);
});
test('same-tab queue triggers do not duplicate a POST', async () => {
  const f = frontend(); await f.run("queuePut({uploadId:'one',bytes:new Uint8Array([1]),mimeType:'image/jpeg',createdAt:Date.now(),attempts:0})");
  f.run("var calls=0,done;attemptSend=async()=>{calls++;await new Promise(r=>done=r);return {status:'COMPLETED'}}");
  const first = f.run("processQueue('first')");
  while (!f.run('calls')) await new Promise(r => setImmediate(r));
  await f.run("processQueue('second')"); assert.equal(f.run('calls'), 1); f.run('done()'); await first;
});
test('receipt response is used directly; attempts are persisted before POST', async () => {
  const f = frontend(); f.run("var item={uploadId:'ok',bytes:new Uint8Array([1]),mimeType:'image/jpeg',attempts:0};blobToBase64=async()=>'';postMedia=async()=>{if((await queueAll())[0].attempts!==1)throw Error('not persisted');return {ok:true,data:{status:'COMPLETED'}}};pollUploadStatus=async()=>{throw Error('unnecessary JSONP')}");
  assert.equal((await f.run('attemptSend(item)')).status, 'COMPLETED');
});
test('confirmed queue receipt updates the main status and removes local item', async () => {
  const f = frontend(); await f.run("queuePut({uploadId:'ok',createdAt:Date.now()});state.doneUploadId='ok';attemptSend=async()=>({status:'COMPLETED'})");
  await f.run("processQueue('test')"); assert.equal((await f.run('queueAll()')).length, 0); assert.equal(f.elements.get('doneTitle').textContent, 'Souvenir bien reçu');
});
test('permanent errors retain an exportable local memory', async () => {
  const f = frontend(); await f.run("queuePut({uploadId:'bad',createdAt:Date.now()});attemptSend=async()=>{throw Object.assign(Error('Format refusé'),{permanent:true})}");
  await f.run("processQueue('test')"); assert.equal((await f.run('queueAll()'))[0].status, 'FAILED');
});
test('recording dimensions survive teardown and discarded recordings do not reopen preview', async () => {
  const f = frontend(); f.context.original = stream(); f.run("state.videoStream=original;state.cameraReady=true;state.captureMode='video';state.audioStream={getAudioTracks:()=>[{}],getTracks:()=>[]};state.recordStream={getAudioTracks:()=>[{}],getVideoTracks:()=>[]};state.recordCanvas={width:720,height:1280};startCanvasPipeline=()=>true;pickVideoMimeType=()=> 'video/webm';MediaRecorder=class {start(){}stop(){}};");
  await f.run('startRecording()'); f.run("state.recordedChunks=[new Blob(['video'])];state.discardRecording=true;stopRecording();stopAllStreams();showScreen('home');state.mediaRecorder.onstop()");
  assert.equal(f.run("el.screenHome.classList.contains('is-active')"), true);
});
test('backend deduplicates receipts and preserves full captions', () => {
  const b = backend(); assert.equal(b.post().status, 'COMPLETED'); assert.equal(b.post().status, 'COMPLETED'); assert.equal(b.files.length, 1);
  assert.equal(JSON.parse(b.files[0].description).message, 'Vive les mariés !'); assert.equal(JSON.parse(b.files[0].description).guestName, 'Élodie');
});
test('backend recovers a created file after a lost receipt without duplication', () => {
  const b = backend(); b.post(); b.cache.clear(); b.props.delete('upload_test-upload'); assert.equal(b.post().status, 'COMPLETED'); assert.equal(b.files.length, 1);
});
test('backend reserves at most six saves and directs the remaining 154 guests to retry', () => {
  const b = backend(); let admitted = 0, retried = 0;
  for (let i = 0; i < 160; i++) { const r = b.run(`reserveUpload_('guest-${i}')`); if (r.admitted) admitted++; if (r.status === 'RETRY') retried++; }
  assert.equal(admitted, 6); assert.equal(retried, 154);
  b.run("releaseUpload_('guest-0')"); assert.equal(b.run("reserveUpload_('guest-6')").admitted, true);
});
test('same upload reserved concurrently reports processing instead of a second save', () => {
  const b = backend(); assert.equal(b.run("reserveUpload_('same')").admitted, true); assert.equal(b.run("reserveUpload_('same')").status, 'PROCESSING');
});
test('backend rejects spoofed MIME, oversized duration and JSONP injection', () => {
  const b = backend(); assert.equal(b.post({ mediaBase64: 'AQID' }).status, 'FAILED'); assert.equal(b.files.length, 0);
  assert.equal(b.post({ mediaType: 'video', mimeType: 'video/mp4', duration: 61 }).status, 'FAILED');
  assert.throws(() => b.run("validateCallbackName_('alert(1)')"));
});

test('a server RETRY status allows a later POST rather than blocking it forever', async () => {
  const f = frontend(); f.run("var posts=0;blobToBase64=async()=>'';checkStatusOnce=async()=>({status:'RETRY',retryAfter:10});postMedia=async()=>{posts++;return {ok:true,data:{status:'COMPLETED'}}};");
  assert.equal((await f.run("attemptSend({uploadId:'retry',bytes:new Uint8Array([1]),mimeType:'image/jpeg',attempts:1})")).status,'COMPLETED');
  assert.equal(f.run('posts'),1);
});
