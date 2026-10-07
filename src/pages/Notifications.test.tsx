import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from '@/test/MemoryRouter';
import Notifications from './Notifications';
vi.mock('@/contexts/NotificationsContext',()=>({useNotifications:()=>({
 items:[{id:'app',kind:'app',title:'App published',href:'/apps/example',createdAt:Date.now(),read:false},
 {id:'monetize',kind:'monetize',title:'Merchant account ready',href:'/buy-with-rocket',createdAt:Date.now(),read:false},
 {id:'billing',kind:'billing',title:'Rocket Developer cancellation scheduled',href:'/settings/developer',createdAt:Date.now(),read:false}],
 unread:3,loading:false,error:null,refresh:vi.fn(),markRead:vi.fn(),markAllRead:vi.fn(),remove:vi.fn(),clearAll:vi.fn(),
})}));
afterEach(cleanup);
describe('notification categories',()=>{
 it('renders and filters real app, monetization and billing events with their destinations',async()=>{
 const ui=render(<MemoryRouter><Notifications/></MemoryRouter>);
 await waitFor(()=>expect(ui.getByRole('link',{name:/App published/}).getAttribute('href')).toBe('/apps/example'));
 fireEvent.click(ui.getByRole('button',{name:'My Apps'}));expect(ui.queryByText('Merchant account ready')).toBeNull();expect(ui.getByText('App published')).toBeTruthy();
 fireEvent.click(ui.getByRole('button',{name:'Monetize'}));expect(ui.getByRole('link',{name:/Merchant account ready/}).getAttribute('href')).toBe('/buy-with-rocket');
 fireEvent.click(ui.getByRole('button',{name:'Billing'}));expect(ui.getByRole('link',{name:/Rocket Developer cancellation scheduled/}).getAttribute('href')).toBe('/settings/developer');
 });
});
