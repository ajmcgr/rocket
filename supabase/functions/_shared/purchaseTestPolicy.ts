// Launch Pro's owner explicitly chose recommended purchase testing. Other offers
// retain their existing verification requirement.
export const OPTIONAL_TEST_APP_ID = "b202d75a-02ae-46e6-8419-5b3410cbaac8";
export const OPTIONAL_TEST_PLAN_ID = "315fa89b-c31e-49e6-b05f-3a9f870cca19";
export function purchaseTestOptional(appId?: string, planId?: string) {
  return appId === OPTIONAL_TEST_APP_ID && planId === OPTIONAL_TEST_PLAN_ID;
}
