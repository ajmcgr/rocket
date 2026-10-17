# Local-only PostgreSQL proof: the plan editor and checkout freeze share a lock.
import subprocess,concurrent.futures,time
args=['psql','-h','/tmp','-p','55437','-d','postgres','-v','ON_ERROR_STOP=1','-Atc']
def sql(query): return subprocess.run(args+[query],text=True,capture_output=True)
def fixture(offer,key):
 q="insert into connect_products(id,client_id,developer_account_id,developer_user_id,product_key,name,stripe_price_id,stripe_product_id,amount_cents,currency,interval,billing_type,platform_fee_bps,is_active,activated_at,entitlement_key) select '"+offer+"',client_id,developer_account_id,developer_user_id,'"+key+"','Race fixture','price_"+key+"',stripe_product_id,3900,'usd',null,'one_time',500,true,now(),'"+key+"' from connect_products limit 1"
 r=sql(q);assert r.returncode==0,r.stderr
def freeze(offer,key):return "select connect_freeze_checkout('11111111-1111-4111-8111-111111111111','app','"+offer+"','acct_merchant','"+key+"-checkout','"+key+"','EXTERNAL_BUTTON',now()+interval '1 hour');"
# Deterministic lock ownership forces both possible serial orders.
for checkout_first,offer,key in [(True,'66666666-6666-4666-8666-666666666666','race-first'),(False,'77777777-7777-4777-8777-777777777777','race-second')]:
 fixture(offer,key)
 first=freeze(offer,key) if checkout_first else "update connect_products set entitlement_key='edited-tier' where id='"+offer+"';"
 second="update connect_products set entitlement_key='edited-tier' where id='"+offer+"';" if checkout_first else freeze(offer,key)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  future=pool.submit(sql,"begin;select pg_advisory_xact_lock(hashtextextended('app',9817));"+first+"select pg_sleep(0.5);commit;")
  time.sleep(0.15)
  other=pool.submit(sql,second)
  a,b=future.result(),other.result()
 assert a.returncode==0,a.stderr
 if checkout_first:assert b.returncode!=0 and 'purchased_entitlement_immutable' in b.stderr,(b.stdout,b.stderr)
 else:assert b.returncode==0 and b.stdout.strip()=='f',(b.stdout,b.stderr)
print('Concurrent edit/checkout: checkout-first freezes key; edit-first rejects stale checkout PASS')
