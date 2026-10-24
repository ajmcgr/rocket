import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import DeveloperActivationNextSteps from './DeveloperActivationNextSteps';
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'owner'}})}));
vi.mock('@/lib/router-compat',()=>({Link:({to,children}:any)=><a href={to}>{children}</a>}));
afterEach(cleanup);
it('offers only optional settings links for eligible owners and can be dismissed',()=>{
  render(<DeveloperActivationNextSteps appId="app" item={{app_id:'app',owned:true,owner_verification_level:'domain_verified'} as any}/>);
  expect(screen.getByRole('link',{name:'Connect analytics →'}).getAttribute('href')).toBe('/my-apps/app/analytics');
  expect(screen.getByRole('link',{name:'Connect revenue →'}).getAttribute('href')).toBe('/my-apps/app/revenue');
  expect(screen.getByText(/Metrics stay private/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Skip for now'}));
  expect(screen.queryByRole('region')).toBeNull();
});
it('does not turn a claimed label or another app into eligible provider access',()=>{
  render(<DeveloperActivationNextSteps appId="app" item={{app_id:'other',owned:true,owner_verification_level:'domain_verified'} as any}/>);
  expect(screen.queryByRole('link',{name:'Connect analytics →'})).toBeNull();
  expect(screen.getByRole('link',{name:'Verify your domain →'})).toBeTruthy();
});
