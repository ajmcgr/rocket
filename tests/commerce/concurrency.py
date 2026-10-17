# Disposable local PostgreSQL only; no network or production credentials.
import subprocess,concurrent.futures
base=['psql','-h','/tmp','-p','55437','-d','postgres','-v','ON_ERROR_STOP=1','-Atc']
def sql(query): return subprocess.check_output(base+[query],text=True).strip()
sql("delete from connect_subscription_checkouts;update connect_products set is_active=true where product_key='pro-year';")
def reserve(offer): return sql("select connect_reserve_subscription('11111111-1111-4111-8111-111111111111','app','"+offer+"','acct_merchant','ROCKET_MARKETPLACE')->>'idempotency_key';")
offers=['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444']*6
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool: keys=list(pool.map(reserve,offers))
assert len(set(keys))==1,keys
assert sql('select count(*) from connect_subscription_checkouts')=='1'
print('12 concurrent multi-plan reservations: one buyer/app row, one idempotency key PASS')
