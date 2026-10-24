// Accept ONLY rows from the anonymous public projections. This helper does
// not query connections, private points, credentials, or visibility settings.
export type ShareMetric = {label: string; value: string; source: string};
const names: Record<string,string> = {ga4:"Google Analytics",posthog:"PostHog",stripe:"Stripe",revenuecat:"RevenueCat",polar:"Polar",dodo:"Dodo Payments"};
const publicValue = (p:any) => p.visibility === 'exact' || p.visibility === 'range';
function fresh(value:unknown,now:number) { const time=Date.parse(String(value)); return Number.isFinite(time) && time<=now+60000 && now-time<=72*3600000; }
function number(value:unknown) { return value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value)>=0; }
function money(value:unknown,currency:string) {
  const format = new Intl.NumberFormat('en-US',{style:'currency',currency:currency.toUpperCase()});
  const digits=format.resolvedOptions().maximumFractionDigits ?? 2;
  const amount=Number(value)/10**digits;
  return amount>=10000 ? new Intl.NumberFormat('en-US',{style:'currency',currency:currency.toUpperCase(),notation:'compact',maximumFractionDigits:1}).format(amount) : format.format(amount);
}
export function publicShareMetrics(traffic:any[],stripe:any[],alternative:any[],now=Date.now()):ShareMetric[] {
  const result:ShareMetric[]=[];
  // During provider switches fail closed rather than merging snapshots.
  if (!(stripe.length && alternative.length)) {
    const revenue=[...alternative,...[...stripe].sort((a,b)=>Number(b.currency==='usd')-Number(a.currency==='usd'))]
      .find(p=>publicValue(p) && fresh(p.verified_at || p.last_verified_at,now));
    if (revenue && /^[a-z]{3}$/i.test(revenue.currency)) {
      try {
        const value=revenue.value_minor ?? revenue.mrr_minor;
        const lower=revenue.range_lower_minor,upper=revenue.range_upper_minor;
        const labels:Record<string,string>={mrr:'Monthly recurring revenue',subscription_mrr:'Subscription MRR',gross_revenue_30d:'Gross revenue · 30 days',paid_volume_30d:'Succeeded payments · 30 days'};
        const label=labels[revenue.metric_type];
        const text=revenue.visibility==='exact' && number(value) ? money(value,revenue.currency)
          : revenue.visibility==='range' && number(lower) && (upper===null || number(upper) && Number(upper)>=Number(lower))
            ? `${money(lower,revenue.currency)}${upper===null ? '+' : `–${money(upper,revenue.currency)}`}` : null;
        if (label && text) result.push({label,value:text,source:`${names[revenue.provider] || 'Provider'} · ${(revenue.verified_at || revenue.last_verified_at).slice(0,10)}`});
      } catch { /* Unknown currencies cannot leak an unformatted private value. */ }
    }
  }
  const priority:Record<string,number>={active_users:0,sessions:1,views:2};
  const point=traffic.filter(p=>publicValue(p) && fresh(p.last_verified_at,now))
    .sort((a,b)=>(priority[a.metric_type]??3)-(priority[b.metric_type]??3)||String(b.metric_date).localeCompare(String(a.metric_date)))
    .find(p=>p.visibility==='exact' ? number(p.value) : typeof p.value_range==='string' && p.value_range.length>0 && p.value_range.length<80);
  if (point && point.metric_type in priority) result.push({label:point.metric_type==='active_users'?'Daily active users':point.metric_type==='sessions'?'Daily sessions':'Daily views',
    value:point.visibility==='range' ? point.value_range : new Intl.NumberFormat('en-US',{notation:Number(point.value)>=1000?'compact':'standard',maximumFractionDigits:1}).format(Number(point.value)),
    source:`${names[point.provider] || 'Provider'} · ${point.metric_date}`});
  return result.slice(0,2);
}
export async function loadPublicShareMetrics(db:any,appId:string):Promise<ShareMetric[]> {
  const reads=await Promise.all([
    db.from('public_app_traction').select('*').eq('app_id',appId),
    db.from('public_app_revenue').select('*').eq('app_id',appId),
    db.from('public_app_verified_revenue').select('*').eq('app_id',appId),
  ]);
  if (reads.some(r=>r.error || !Array.isArray(r.data))) return [];
  return publicShareMetrics(reads[0].data,reads[1].data,reads[2].data);
}

export async function loadPublicShareMetricsForApps(db:any,appIds:string[]):Promise<Map<string,ShareMetric[]>> {
  if (!appIds.length) return new Map();
  const reads=await Promise.all(['public_app_traction','public_app_revenue','public_app_verified_revenue'].map(table=>
    db.from(table).select('*').in('app_id',appIds)));
  if (reads.some(r=>r.error || !Array.isArray(r.data))) return new Map();
  return new Map(appIds.map(id=>[id,publicShareMetrics(...reads.map(r=>r.data.filter((p:any)=>p.app_id===id)) as [any[],any[],any[]])]));
}
