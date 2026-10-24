// Runs inside the existing origin-checked view endpoint. Client requests may
// record only public share/visit events; verified outcomes come from the DB.
export async function recordGrowthRequest(req: Request, body: Record<string, unknown>, admin: any, visitorHash: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const kind = body.kind;
  if (!['share_action','referral_visit','referral_signup'].includes(String(kind)) || typeof body.event_id !== 'string' || !uuid.test(body.event_id)) return {status:400,body:{error:'Invalid growth event'}};
  let userId: string | null = null;
  let accountCreatedAt: string | null = null;
  if (kind === 'referral_signup') {
    if (typeof body.referral_id !== 'string' || !uuid.test(body.referral_id)) return {status:400,body:{error:'Invalid referral'}};
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
    if (!token) return {status:401,body:{error:'Authentication required'}};
    const {data,error} = await admin.auth.getUser(token);
    if (error || !data?.user?.email_confirmed_at || !data.user.created_at) return {status:401,body:{error:'Confirmed account required'}};
    userId = data.user.id;
    accountCreatedAt = data.user.created_at;
  } else if (!['app','profile'].includes(String(body.target_kind)) || typeof body.identifier !== 'string' || body.identifier.length>120 ||
    (kind === 'share_action' && !['link','caption','download','intent','native'].includes(String(body.method)))) return {status:400,body:{error:'Invalid public event'}};
  const {data,error} = await admin.rpc('record_rocket_growth_event',{
    p_event_id:body.event_id,p_event_name:kind,p_target_kind:kind === 'referral_signup' ? null : body.target_kind,
    p_identifier:kind === 'referral_signup' ? null : body.identifier,p_method:kind === 'share_action' ? body.method : null,
    p_visitor_hash:visitorHash,p_user_id:userId,p_account_created_at:accountCreatedAt,p_referral_id:kind === 'referral_signup' ? body.referral_id : null,
  });
  if (error) throw error;
  return {status:200,body:{ok:true,counted:data===true}};
}
