import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {scryptSync,createHmac} from 'node:crypto';
import {createGate,isHeavyPath} from './gate.mjs';

test('form gate preserves authentication without browser challenge dialogs', async t => {
  const upstream = http.createServer((req,res)=> {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({url:req.url,cookie:req.headers.cookie,authorization:req.headers.authorization}));});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const salt='0123456789abcdef0123456789abcdef';
  const config={host:'preview.test',passwordHash:salt+':'+scryptSync('test-password',salt,64).toString('hex'),sessionKey:'s'.repeat(64),upstream:`http://127.0.0.1:${upstream.address().port}`};
  const gate=createGate(config); await new Promise(r=>gate.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>gate.close(r));await new Promise(r=>upstream.close(r));});
  const base=`http://127.0.0.1:${gate.address().port}`;
  let response=await fetch(base+'/login',{redirect:'manual'});
  assert.equal(response.status,302); assert.equal(response.headers.get('www-authenticate'),null);
  response=await fetch(base+'/api/v1/health');assert.equal(response.status,401);
  response=await fetch(base+'/__preview/login');assert.equal(response.status,200);
  assert.match(await response.text(),/autocomplete="current-password"/);
  const login=(password,origin='https://preview.test',ip='test-client')=>fetch(base+'/__preview/login',{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded','X-Forwarded-For':ip},body:new URLSearchParams({username:'preview',password})});
  assert.equal((await login('test-password','https://attacker.test')).status,403);
  response=await login('wrong');assert.equal(response.headers.get('location'),'/__preview/login?error=1');
  response=await login('test-password');assert.equal(response.status,303);
  const setCookie=response.headers.get('set-cookie');
  assert.match(setCookie,/Secure; HttpOnly; SameSite=Strict/);assert.doesNotMatch(setCookie,/Domain=/i);
  const cookie=setCookie.split(';')[0];
  response=await fetch(base+'/api/v1/health',{headers:{Cookie:cookie}});assert.equal(response.status,200);
  assert.equal((await response.json()).cookie,'');
  response=await fetch(base+'/api/v1/health',{headers:{Cookie:cookie+'tampered'}});assert.equal(response.status,401);
  const expired=`${Math.floor(Date.now()/1000)-1}.${'a'.repeat(32)}`;
  const signature=createHmac('sha256',config.sessionKey).update(expired).digest('base64url');
  response=await fetch(base+'/api/v1/health',{headers:{Cookie:`__Host-manage_preview=${expired}.${signature}`}});assert.equal(response.status,401);
  response=await fetch(base+'/api/v1/health',{headers:{Authorization:'Basic '+Buffer.from('preview:test-password').toString('base64')}});assert.equal(response.status,200);assert.equal((await response.json()).authorization,undefined);
  for(let i=0;i<8;i++) await login('wrong','https://preview.test','rate-limited');
  assert.equal((await login('test-password','https://preview.test','rate-limited')).status,429);
});

test('personal mode requires an application session and cannot use the shared gate cookie',async t=>{
  const target=http.createServer((req,res)=>{
    if(req.url==='/auth/me'){
      const cookie=String(req.headers.cookie);
      const verified=cookie.includes('manage_session=verified'),pin=cookie.includes('manage_session=staffpin');
      res.statusCode=verified||pin||cookie.includes('manage_session=password')?200:401;
      res.end(JSON.stringify({authentication:verified?'totp':pin?'pin':'password'}));
    }
    else res.end('app');
  });
  await new Promise(r=>target.listen(0,'127.0.0.1',r));
  const baseTarget=`http://127.0.0.1:${target.address().port}`;
  const salt='a'.repeat(32),sessionKey='t'.repeat(64);
  const gate=createGate({host:'preview.test',passwordHash:salt+':'+scryptSync('test-only-password',salt,64).toString('hex'),sessionKey,totpAuth:true,upstream:baseTarget,authApi:baseTarget+'/auth/me'});
  await new Promise(r=>gate.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>gate.close(r));await new Promise(r=>target.close(r));});
  const base=`http://127.0.0.1:${gate.address().port}`;
  assert.equal((await fetch(base+'/login')).status,200);
  assert.equal((await fetch(base+'/activate')).status,200);
  assert.equal((await fetch(base+'/manifest.webmanifest')).status,200);
  assert.equal((await fetch(base+'/brand/pwa-192.png')).status,200);
  assert.equal((await fetch(base+'/brand/pwa-512.png')).status,200);
  assert.equal((await fetch(base+'/brand/apple-touch-icon.png')).status,200);
  assert.equal((await fetch(base+'/favicon.ico')).status,200);
  assert.equal((await fetch(base+'/api/v1/auth/email/login',{method:'POST'})).status,200);
  let response=await fetch(base+'/cases',{redirect:'manual'});assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/login');
  const payload=`${Math.floor(Date.now()/1000)+3600}.${'a'.repeat(32)}`;
  const legacy=payload+'.'+createHmac('sha256',sessionKey).update(payload).digest('base64url');
  response=await fetch(base+'/cases',{redirect:'manual',headers:{Cookie:'__Host-manage_preview='+legacy}});assert.equal(response.status,302);
  assert.equal((await fetch(base+'/api/v1/dashboard')).status,401);
  assert.equal((await fetch(base+'/manifest.webmanifest/private',{redirect:'manual'})).status,302);
  assert.equal((await fetch(base+'/launch',{redirect:'manual'})).status,302);
  assert.equal((await fetch(base+'/cases',{redirect:'manual',headers:{Cookie:'manage_session=password'}})).status,302);
  assert.equal((await fetch(base+'/cases',{headers:{Cookie:'manage_session=verified'}})).status,200);
  // A staff PIN session reaches its pages and API calls; before this, every staff member bounced back to /login.
  assert.equal((await fetch(base+'/workshop/technician',{redirect:'manual',headers:{Cookie:'manage_session=staffpin'}})).status,200);
  assert.equal((await fetch(base+'/launch',{redirect:'manual',headers:{Cookie:'manage_session=staffpin'}})).status,200);
  assert.equal((await fetch(base+'/api/v1/dashboard',{headers:{Cookie:'manage_session=staffpin'}})).status,200);
});

test('heavy report paths are recognized; ordinary pages and APIs are not', () => {
  for (const p of ['/api/v1/daily-reports/uploads','/api/v1/daily-reports/imports/1/apply','/api/v1/reference-imports','/api/v1/reference-imports/1/apply',
    '/api/v1/vehicle-imports/1/apply','/api/v1/reports','/api/v1/reports/export','/api/v1/stock/reservations/export','/api/v1/emdad/requests/export',
    '/api/v1/cases/1/parts-statement/export','/api/v1/cases/1/parts/import','/api/v1/assessments/1/import','/api/v1/cases/1/picking.pdf','/api/v1/inspection.pdf'])
    assert.equal(isHeavyPath(p), true, p);
  for (const p of ['/api/v1/auth/me','/api/v1/cases','/api/v1/cases/1/parts','/api/v1/dashboard','/cases/1','/daily-reports','/api/v1/reportsx','/api/v1/stock/options'])
    assert.equal(isHeavyPath(p), false, p);
});

// Timings are scaled: 10 ms here stand for 1 s in production (ordinary 30 s → 300 ms, heavy 300 s → 3 000 ms).
test('heavy reports wait up to the heavy limit; ordinary requests keep 30 s; slow answers are no longer cut at 15 s', async t => {
  const upstream = http.createServer((req,res)=>{const ms=Number(new URL(req.url,'http://x').searchParams.get('ms'));setTimeout(()=>{if(!res.destroyed)res.end(JSON.stringify({ok:true,ms}));},ms);});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const salt='0123456789abcdef0123456789abcdef';
  const gate=createGate({host:'preview.test',passwordHash:salt+':'+scryptSync('test-password',salt,64).toString('hex'),sessionKey:'s'.repeat(64),
    upstream:`http://127.0.0.1:${upstream.address().port}`,timeoutMs:300,heavyTimeoutMs:3000,bodyIdleTimeoutMs:150});
  await new Promise(r=>gate.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>gate.close(r));upstream.closeAllConnections();await new Promise(r=>upstream.close(r));});
  const auth={Authorization:'Basic '+Buffer.from('preview:test-password').toString('base64')};
  const base=`http://127.0.0.1:${gate.address().port}`;
  const call=async(path,ms)=>{const r=await fetch(`${base}${path}?ms=${ms}`,{headers:auth});return {status:r.status,body:await r.text()};};
  const heavy='/api/v1/daily-reports/imports/1/apply';
  const [slowOrdinary,lateOrdinary,...rest]=await Promise.all([
    call('/api/v1/cases',200),          // 20 s: was ECONNRESET at 15 s before the fix
    call('/api/v1/cases',600),          // 60 s: beyond the ordinary 30 s
    call(heavy,300),call(heavy,600),call(heavy,1200),call(heavy,1800),call(heavy,2850), // 30 / 60 / 120 / 180 / ~300 s
    call('/api/v1/reports/export',3400), // beyond 300 s: such work must run as a background job
  ]);
  assert.equal(slowOrdinary.status,200);
  assert.equal(lateOrdinary.status,504);assert.equal(JSON.parse(lateOrdinary.body).code,'GATEWAY_TIMEOUT');
  const tooLong=rest.pop();
  for(const r of rest)assert.equal(r.status,200,r.body);
  assert.equal(tooLong.status,504);
});

test('a request whose body stops arriving is still closed by the slow-sender guard', async t => {
  const upstream = http.createServer((req,res)=>{req.resume();req.on('end',()=>res.end('{}'));});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const salt='0123456789abcdef0123456789abcdef';
  const gate=createGate({host:'preview.test',passwordHash:salt+':'+scryptSync('test-password',salt,64).toString('hex'),sessionKey:'s'.repeat(64),
    upstream:`http://127.0.0.1:${upstream.address().port}`,bodyIdleTimeoutMs:150});
  await new Promise(r=>gate.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>gate.close(r));await new Promise(r=>upstream.close(r));});
  const started=Date.now();
  const closed=await new Promise(resolve=>{
    const basic=Buffer.from('preview:test-password').toString('base64');
    const s=net.connect(gate.address().port,'127.0.0.1',()=>s.write(`POST /api/v1/cases HTTP/1.1\r\nHost: x\r\nAuthorization: Basic ${basic}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"a"`));
    s.on('close',()=>resolve(Date.now()-started));s.on('error',()=>{});
    setTimeout(()=>{s.destroy();resolve(-1);},3000);
  });
  assert.ok(closed>0&&closed<2000,`closed after ${closed} ms`);
});
