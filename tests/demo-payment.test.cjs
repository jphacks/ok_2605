const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { initializeMedicationDatabase, saveMedication } = require('../src/features/medications/medication-repository.ts');
const { runDemoPayment, retryDemoPayment, listDemoPayments, listDemoPaymentAttempts } = require('../src/features/payments/demo-payment-repository.ts');
const { demoDeadline, isPenaltyDue } = require('../src/features/payments/demo-payment.ts');
async function setup(t, path = ':memory:') {
 let c = new DatabaseSync(path); t.after(() => c.close());
 const db = {
 async execAsync(s) { c.exec(s); },
 async runAsync(s,...p) { const r=c.prepare(s).run(...p); return {lastInsertRowId:Number(r.lastInsertRowid),changes:Number(r.changes)}; },
 async getAllAsync(s,...p) { return c.prepare(s).all(...p).map(r=>({...r})); },
 async getFirstAsync(s,...p) { const r=c.prepare(s).get(...p); return r?{...r}:null; },
 async withExclusiveTransactionAsync(fn) { c.exec('BEGIN IMMEDIATE'); try { await fn(db); c.exec('COMMIT'); } catch(e) { c.exec('ROLLBACK'); throw e; } }
 };
 await initializeMedicationDatabase(db);
 const m=await saveMedication(db,{name:'朝の薬',doseTime:'08:00',penaltyAmount:'300'});
 return {db,reopen() { c.close(); c = new DatabaseSync(path); },request:{medicationId:m.id,day:'2026-10-17',scenario:'overdue',outcome:'success'}};
}
test('grace boundary, taken state, and invalid dates',()=>{
 const d=demoDeadline('2026-10-17','08:00');
 assert.equal(d.getMinutes(),30);
 assert.equal(isPenaltyDue(false,new Date(+d-1),d),false);
 assert.equal(isPenaltyDue(false,d,d),true);
 assert.equal(isPenaltyDue(true,new Date(+d+1),d),false);
 assert.throws(()=>demoDeadline('2026-02-30','08:00'));
});
test('in-grace and taken do not create payment records',async t=>{
 const {db,request}=await setup(t);
 for(const scenario of ['within-grace','taken']) assert.equal((await runDemoPayment(db,{...request,scenario})).kind,'skipped');
 assert.deepEqual(await listDemoPayments(db),[]);
});
test('parallel requests and repeated success cannot double charge',async t=>{
 const {db,request}=await setup(t);
 const results=await Promise.all(Array.from({length:5},()=>runDemoPayment(db,request)));
 assert.equal(results.filter(r=>r.kind==='processed').length,1);
 const rows=await listDemoPayments(db); assert.equal(rows.length,1); assert.equal(rows[0].amount,300); assert.equal(rows[0].mode,'demo');
 assert.equal((await listDemoPaymentAttempts(db)).length,1);
 assert.equal((await retryDemoPayment(db,rows[0].id,'failure')).kind,'already-succeeded');
});
test('failure retry preserves original amount and both attempt results',async t=>{
 const {db,request}=await setup(t);
 const r=await runDemoPayment(db,{...request,outcome:'failure'});
 await db.runAsync('UPDATE medications SET penalty_amount=500 WHERE id=?',request.medicationId);
 const retried=await retryDemoPayment(db,r.payment.id,'success');
 assert.equal(retried.payment.amount,300); assert.equal(retried.payment.attemptCount,2);
 assert.deepEqual((await listDemoPaymentAttempts(db)).map(r=>r.status),['failed','succeeded']);
});
test('invalid inputs do not write; separate dates have separate payments',async t=>{
 const {db,request}=await setup(t);
 for(const change of [{medicationId:999},{day:'2026-02-30'},{outcome:'unknown'}]) await assert.rejects(runDemoPayment(db,{...request,...change}));
 assert.deepEqual(await listDemoPayments(db),[]);
 await runDemoPayment(db,request); await runDemoPayment(db,{...request,day:'2026-10-18'});
 assert.equal((await listDemoPayments(db)).length,2);
});
test('failed DB update atomically rolls back attempts and permits retry',async t=>{
 const {db,request}=await setup(t);
 await db.execAsync("CREATE TRIGGER fail_payment BEFORE UPDATE ON demo_penalty_payments BEGIN SELECT RAISE(ABORT,'disk simulation'); END;");
 await assert.rejects(runDemoPayment(db,request),/disk simulation/);
 assert.deepEqual(await listDemoPayments(db),[]); assert.deepEqual(await listDemoPaymentAttempts(db),[]);
 await db.execAsync('DROP TRIGGER fail_payment');
 assert.equal((await runDemoPayment(db,request)).payment.status,'succeeded');
});
test('v1 migration preserves medication; repeated initialization preserves payments',async t=>{
 const {db,request}=await setup(t);
 await db.execAsync('DROP TABLE demo_payment_attempts; DROP TABLE demo_penalty_payments; PRAGMA user_version=1;');
 await initializeMedicationDatabase(db); await runDemoPayment(db,request);
 await initializeMedicationDatabase(db);
 assert.equal((await runDemoPayment(db,request)).kind,'already-succeeded');
 assert.equal((await listDemoPaymentAttempts(db)).length,1);
 assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,5);
});

test('file database reopening retains history and prevents another successful payment',async t=>{
 const {mkdtemp,rm}=require('node:fs/promises'); const {join}=require('node:path');
 const dir=await mkdtemp(join(__dirname,'.payment-test-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const {db,request,reopen}=await setup(t,join(dir,'payments.db'));
 await runDemoPayment(db,request); reopen(); await initializeMedicationDatabase(db);
 assert.equal((await runDemoPayment(db,request)).kind,'already-succeeded');
 assert.equal((await listDemoPaymentAttempts(db)).length,1);
});
