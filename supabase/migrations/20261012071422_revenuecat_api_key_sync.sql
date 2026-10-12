-- RevenueCat's self-service API-key connection uses the existing service-only
-- sync queue. The shared internal secret never enters the browser.
select cron.schedule('rocket-revenuecat-daily-sync', '45 3 * * *',
  $$select net.http_post(
    url := 'https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-revenuecat',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-rocket-revenue-sync', (select decrypted_secret from vault.decrypted_secrets
        where name = 'rocket_posthog_sync_secret')),
    body := jsonb_build_object('action', 'scheduled_sync'),
    timeout_milliseconds := 30000
  );$$);
