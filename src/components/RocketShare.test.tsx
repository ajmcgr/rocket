import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import RocketShare from './RocketShare';
const {growth,track}=vi.hoisted(()=>({growth:vi.fn(),track:vi.fn()}));
vi.mock('@/lib/growthTracking',()=>({recordGrowthShare:growth}));
vi.mock('@/lib/analytics',()=>({track}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
it('separates dialog usage from a successful share action and keeps attributed links',async()=>{
  const write=vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator',{clipboard:{writeText:write}});
  render(<RocketShare kind="app" identifier="launch" title="Launch"/>);
  fireEvent.click(screen.getByRole('button',{name:'Share',exact:true}));
  expect(growth).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Copy link'}));
  await waitFor(()=>expect(growth).toHaveBeenCalledWith('app','launch','link'));
  expect(growth).toHaveBeenCalledTimes(1);
  expect(write.mock.calls[0][0]).toContain('utm_source=rocket_share');
});
it('does not count a failed copy as a share',async()=>{
  vi.stubGlobal('navigator',{clipboard:{writeText:vi.fn().mockRejectedValue(new Error('denied'))}});
  render(<RocketShare kind="profile" identifier="alex" title="Alex"/>);
  fireEvent.click(screen.getByRole('button',{name:'Share',exact:true}));
  fireEvent.click(screen.getByRole('button',{name:'Copy link'}));
  await screen.findByText('Could not copy automatically.');
  expect(growth).not.toHaveBeenCalled();
});
