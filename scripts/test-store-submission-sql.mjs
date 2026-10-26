// Real PostgreSQL proof of store identity and publication authorization.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const pg = new PGlite();
await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema app_graph; create schema auth;
create table auth.users(id uuid primary key);
create table app_graph.apps(id uuid primary key default gen_random_uuid(),seed_source_type text,seed_source_external_id text,
 name text,tagline text,description text,website_url text,canonical_host text,logo_url text,source_hash text,is_public boolean default false,
 claim_state text default 'unclaimed',slug text unique,categories text[],platforms text[],tags text[],updated_at timestamptz,
 unique(seed_source_type,seed_source_external_id));
create table app_graph.app_sources(id uuid primary key default gen_random_uuid(),app_id uuid references app_graph.apps(id),
 source_type text,external_id text,source_url text,normalized_source_url text unique,website_url text,source_hash text,
 match_state text,status text default 'active',public_evidence jsonb,unique(source_type,external_id));
create table public.app_jobs(id uuid primary key default gen_random_uuid(),user_id uuid,normalized_url text,status text default 'queued',app_id uuid,result jsonb default '{}',error text,updated_at timestamptz);
create table public.app_owners(app_id uuid,user_id uuid,revoked_at timestamptz);
create table app_graph.app_media(app_id uuid,source_type text,source_media_id text,media_type text,source_url text,sort_order integer);
create table app_graph.app_identity_events(app_id uuid,event_type text,details jsonb);
grant usage on schema app_graph,auth to anon,authenticated,service_role;
grant all on all tables in schema app_graph,public,auth to service_role;
grant select on app_graph.apps to anon,authenticated;
`);
const migration='../supabase/migrations/20261026052529_mobile_store_submissions.sql';
await pg.exec(readFileSync(new URL(migration,import.meta.url),'utf8'));
await pg.exec(readFileSync(new URL('../supabase/migrations/20261003071805_app_submission_publish.sql',import.meta.url),'utf8'));
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
await pg.query('insert into auth.users values($1),($2)',[owner,other]);
const url=(type,id)=>type==='apple_app_store'?`https://apps.apple.com/app/id${id}`:`https://play.google.com/store/apps/details?id=${id}`;
const job=async(who,type,id)=>(await pg.query('insert into public.app_jobs(user_id,normalized_url) values($1,$2) returning id',[who,url(type,id)])).rows[0].id;
const resolve=(who,jobId,type,id)=>pg.query('select public.resolve_store_app_submission($1,$2,$3,$4,$5,$6,$7,$8,$9) result',
 [who,jobId,type,id,url(type,id),`App ${id}`,'An independent mobile app with public listing details.',null,{}]);
const lookup=(type,id)=>pg.query('select * from public.lookup_store_app_submission($1,$2)',[type,id]);
await pg.exec('set role service_role');
const j1=await job(owner,'apple_app_store','111'),j2=await job(owner,'apple_app_store','222'),j3=await job(owner,'google_play','com.example.one'),j4=await job(owner,'google_play','com.example.two');
const results=[];
for(const [j,t,id] of [[j1,'apple_app_store','111'],[j2,'apple_app_store','222'],[j3,'google_play','com.example.one'],[j4,'google_play','com.example.two']]) results.push((await resolve(owner,j,t,id)).rows[0].result);
assert.equal(new Set(results.map(r=>r.app_id)).size,4,'same-store domains never merge different apps');
assert.equal((await lookup('apple_app_store','111')).rows.length,0,'private draft is absent from public preview lookup');
assert.equal((await resolve(owner,j1,'apple_app_store','111')).rows[0].result.outcome,'new','safe private retry retains publication eligibility');
await assert.rejects(resolve(other,j1,'apple_app_store','111'),'cross-user job rejected');
const otherJob=await job(other,'apple_app_store','111');
await assert.rejects(resolve(other,otherJob,'apple_app_store','111'),'private source blocks another user');
const details={name:'Example',tagline:'Useful mobile software',description:'An independent mobile app with public listing details.',slug:'example-mobile',logo_url:'https://cdn.example.com/icon.png',categories:['Productivity'],platforms:['ios'],tags:[],submission_type:'founder',media:[{type:'thumbnail',url:'https://cdn.example.com/hero.png'},{type:'screenshot',url:'https://cdn.example.com/shot.png'}]};
const appId=results[0].app_id;
await assert.rejects(pg.query('select public.publish_new_app_submission($1,$2,$3)',[other,appId,details]));
await pg.query('select public.publish_new_app_submission($1,$2,$3)',[owner,appId,details]);
assert.equal((await lookup('apple_app_store','111')).rows[0].id,appId);
assert.equal((await resolve(other,otherJob,'apple_app_store','111')).rows[0].result.outcome,'existing');
await pg.query('select public.publish_new_app_submission($1,$2,$3)',[owner,appId,{...details,name:'Overwrite attempt'}]);
assert.equal((await pg.query('select name from app_graph.apps where id=$1',[appId])).rows[0].name,'Example','published retry immutable');
assert.equal((await pg.query('select count(*)::int n from public.app_owners')).rows[0].n,0,'publication grants no ownership');
assert.equal((await pg.query('select claim_state from app_graph.apps where id=$1',[appId])).rows[0].claim_state,'unclaimed');
await pg.exec(`insert into app_graph.apps(seed_source_type,seed_source_external_id,name,website_url,canonical_host,is_public)
values('launch','legacy-store','Legacy store app','https://apps.apple.com/gb/app/old-name/id555?utm_source=launch','apps.apple.com',true)`);
const legacyJob=await job(owner,'apple_app_store','555');
const legacy=(await resolve(owner,legacyJob,'apple_app_store','555')).rows[0].result;
assert.equal(legacy.outcome,'existing','regional/renamed legacy URLs match the same ID');
assert.equal((await lookup('apple_app_store','555')).rows.length,1);
for(const role of ['anon','authenticated']){
 await pg.exec(`reset role;set role ${role}`);
 await assert.rejects(lookup('apple_app_store','111'));
 await assert.rejects(resolve(owner,j1,'apple_app_store','111'));
}
await pg.close();
console.log('PASS: distinct store identities, private draft isolation, duplicate/region reconciliation, cross-user rejection, publication, immutable retry, no ownership grants and service-only RPCs');
