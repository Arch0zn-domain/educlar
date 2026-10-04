import { catalog } from '@/lib/read';
export async function GET(req:Request) {
  const result=await catalog(Object.fromEntries(new URL(req.url).searchParams));
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}
