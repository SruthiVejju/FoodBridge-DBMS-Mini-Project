/**
 * FoodBridge: Two-session PostgreSQL concurrency test.
 * Food Waste Redistribution and Resource Allocation System
 * Sruthi Vejju — PES1UG24CS472
 * Shubashitha Gowtham — PES1UG24CS450
 *
 * Run from food-waste-web root with: node .\FoodBridge_Concurrency_Test.cjs
 * Requires @next/env and pg, which are already installed in the Next.js app.
 *
 * Creates isolated fixture records, tests simultaneous reservations using two
 * independent PostgreSQL clients, then deletes the fixtures in a finally block.
 * Real donor/NGO records and allocations are never selected or changed.
 * Identity sequences may advance; that's normal. If forcibly interrupted,
 * fixtures may remain with org_name beginning 'QA-CONCURRENCY-'.
 */
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());
const { Client } = require('pg');
const needed = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const key of needed) {
  if (!process.env[key]) {
    console.error(`MISSING CONFIGURATION: ${key}`);
    process.exit(1);
  }
}
const opts = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionTimeoutMillis: 5000,
};
const control = new Client(opts);
const a = new Client(opts);
const b = new Client(opts);
let fixture = {};
let txA = false;
let txB = false;
const prefix = `QA-CONCURRENCY-${Date.now()}-`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function cleanup() {
  try {
    if (txA) await a.query('ROLLBACK');
  } catch (e) { console.error('Warning: rollback session A:', e.message); }
  try {
    if (txB) await b.query('ROLLBACK');
  } catch (e) { console.error('Warning: rollback session B:', e.message); }
  if (fixture.donationId && fixture.requestA && fixture.requestB && fixture.donorId && fixture.ngoId) {
    try {
      await control.query('BEGIN');
      await control.query('DELETE FROM allocations WHERE donation_id = $1', [fixture.donationId]);
      await control.query('DELETE FROM ngo_requests WHERE request_id IN ($1,$2)', [fixture.requestA, fixture.requestB]);
      await control.query('DELETE FROM donations WHERE donation_id = $1', [fixture.donationId]);
      await control.query('DELETE FROM organizations WHERE org_id IN ($1,$2)', [fixture.donorId, fixture.ngoId]);
      await control.query('COMMIT');
      console.log('CLEANUP PASS: Isolated test records removed.');
    } catch (e) {
      await control.query('ROLLBACK').catch(() => {});
      console.error('CLEANUP FAILED:', e.message);
      console.error('Only QA-CONCURRENCY- test records may remain; ordinary project data was not touched.');
      process.exitCode = 1;
    }
  }
  await Promise.allSettled([a.end(), b.end(), control.end()]);
}

async function main() {
  try {
    await Promise.all([control.connect(), a.connect(), b.connect()]);
    await control.query('BEGIN');
    const donor = await control.query(
      `INSERT INTO organizations(org_name,org_type,address,contact_person,contact_phone)
       VALUES($1,'DONOR','QA address','QA','0000000000') RETURNING org_id`, [prefix + 'DONOR']);
    fixture.donorId = donor.rows[0].org_id;
    const ngo = await control.query(
      `INSERT INTO organizations(org_name,org_type,address,contact_person,contact_phone)
       VALUES($1,'NGO','QA address','QA','0000000000') RETURNING org_id`, [prefix + 'NGO']);
    fixture.ngoId = ngo.rows[0].org_id;
    const donation = await control.query(
      `INSERT INTO donations(donor_org_id,food_name,description,category,total_qty,unit,expires_at,pickup_address)
       VALUES($1,'QA food','QA concurrent reservation','Cooked food',5,'servings',CURRENT_TIMESTAMP+INTERVAL '2 days','QA pickup')
       RETURNING donation_id`, [fixture.donorId]);
    fixture.donationId = donation.rows[0].donation_id;
    async function request() {
      const result = await control.query(
        `INSERT INTO ngo_requests(ngo_org_id,description,category,requested_qty,unit,needed_by,delivery_address)
         VALUES($1,'QA need food','Cooked food',5,'servings',CURRENT_TIMESTAMP+INTERVAL '1 day','QA delivery')
         RETURNING request_id`, [fixture.ngoId]);
      return result.rows[0].request_id;
    }
    fixture.requestA = await request();
    fixture.requestB = await request();
    await control.query('COMMIT');
    console.log('Fixture ready: donation has 5 servings; two independent NGO requests each need 5.');

    await a.query('BEGIN'); txA = true;
    await a.query("SET LOCAL statement_timeout = '15s'");
    await a.query('SELECT reserve_food($1,$2,$3) AS id', [fixture.donationId, fixture.requestA, 5]);
    console.log('Session A: reserved all 5 servings (transaction deliberately still open).');

    await b.query('BEGIN'); txB = true;
    await b.query("SET LOCAL statement_timeout = '15s'");
    // Session B must wait for the same donation row lock held by A.
    let outcomeB = 'pending';
    const attemptB = b.query('SELECT reserve_food($1,$2,$3) AS id',
      [fixture.donationId, fixture.requestB, 5])
      .then(r => { outcomeB = 'success'; return {success:true, row:r.rows[0]}; })
      .catch(e => { outcomeB = 'error'; return {success:false, error:e}; });
    await sleep(250);
    if (outcomeB !== 'pending') throw new Error('Session B did not wait for the first transaction lock.');
    console.log('Session B: blocked while Session A holds the donation row lock.');

    await a.query('COMMIT'); txA = false;
    console.log('Session A: COMMIT succeeded.');
    const second = await attemptB;
    if (second.success) throw new Error('FAILED: Session B also reserved 5; over-allocation detected!');
    if (!/Allocation exceeds remaining donation quantity/.test(second.error.message)) {
      throw new Error('FAILED: Session B was rejected for an unexpected reason: ' + second.error.message);
    }
    console.log('Session B: correctly rejected after Session A committed:', second.error.message);
    await b.query('ROLLBACK'); txB = false;

    const check = await control.query(
      `SELECT available_qty FROM donation_availability WHERE donation_id = $1`, [fixture.donationId]);
    const remaining = Number(check.rows[0]?.available_qty);
    if (remaining !== 0) throw new Error(`FAILED: expected zero available servings; got ${remaining}`);
    const active = await control.query(
      `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(allocated_qty),0)::numeric AS total
       FROM allocations WHERE donation_id=$1 AND status IN ('RESERVED','COLLECTED')`, [fixture.donationId]);
    if (active.rows[0].cnt !== 1 || Number(active.rows[0].total) !== 5) {
      throw new Error(`FAILED: expected one allocation of 5, got ${JSON.stringify(active.rows[0])}`);
    }
    console.log('PASS: exactly one reservation was committed; total allocated 5/5; available 0.');
    console.log('SUCCESS: TWO-SESSION CONCURRENCY TEST PASSED.');
  } catch (e) {
    console.error('CONCURRENCY TEST FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}
main();
