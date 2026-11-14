// A server-rendered website link can be used before React hydrates. This small
// delegated listener records that early click without delaying the destination.
// Once React handles the click, its handler marks the event and keeps the full
// existing analytics path (including discovery journeys).
export const earlyOutboundTrackingScript = `(function(){
  if(location.origin!=="https://tryrocket.ai"&&location.origin!=="https://www.tryrocket.ai")return;
  document.addEventListener("click",function(event){
    if(event.rocketOutboundHandled||!(event.target instanceof Element))return;
    var link=event.target.closest("a[data-rocket-outbound-app-id]");
    if(!link)return;
    var id=link.getAttribute("data-rocket-outbound-app-id");
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||""))return;
    var params=new URLSearchParams(location.search);
    var source=params.get("utm_source");
    if(source!=="rocket_badge"&&source!=="rocket_share"&&source!=="rocket_mcp")source="direct";
    queueMicrotask(function(){
      // React can dispatch its delegated click after this document listener.
      if(event.rocketOutboundHandled)return;
      try{fetch("https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-app-view",{
        method:"POST",mode:"cors",keepalive:true,headers:{"Content-Type":"application/json"},
        body:JSON.stringify({app_id:id,kind:"outbound",source:source,sponsorship_id:params.get("sponsor")})
      }).catch(function(){});}catch(e){}
    });
  });
})();`;
