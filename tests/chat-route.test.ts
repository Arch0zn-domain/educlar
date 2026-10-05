import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(()=>({user:vi.fn(),query:vi.fn()}));
vi.mock('../src/lib/auth',()=>({currentUser:mocks.user}));
vi.mock('../src/lib/db',()=>({atomicQuery:mocks.query}));
import { POST, DELETE, GET } from '../src/app/api/chat/route';
const request = (body:string,origin='http://127.0.0.1:3000',headers:Record<string,string>={}) => new Request('http://127.0.0.1:3000/api/chat',{
  method:'POST',headers:{origin,'Content-Type':'application/json',...headers},body,
});
beforeEach(()=>{vi.clearAllMocks();mocks.user.mockResolvedValue(null);mocks.query.mockResolvedValue([]);});
describe('chat boundary',()=>{
  it('requires sign-in and rejects cross-origin requests before touching the database',async()=>{
    expect((await POST(request('{}','https://untrusted.example'))).status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
    expect((await POST(request('{}'))).status).toBe(401);expect((await GET()).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('rejects oversized bodies without trusting Content-Length and malformed JSON',async()=>{
    mocks.user.mockResolvedValue({id:'demo-parent'});
    expect((await POST(request('x'.repeat(40001)))).status).toBe(413);
    expect((await POST(request('{bad'))).status).toBe(400);
    expect((await POST(request('{}','http://127.0.0.1:3000',{'Content-Type':'text/plain'}))).status).toBe(415);
  });
  it('deletes only the signed-in account cache and protects deletion from cross-origin calls',async()=>{
    mocks.user.mockResolvedValue({id:'demo-parent'});
    expect((await DELETE(request('', 'https://untrusted.example'))).status).toBe(403);
    expect((await DELETE(request(''))).status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith('DELETE FROM assistant_cache WHERE user_id=$1',['demo-parent']);
  });
});
