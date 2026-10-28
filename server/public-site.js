// Public demo assets and read APIs only. Access management stays on the private Worker.
export default {
  async fetch(request,env){
    // Fail closed unless the owner explicitly enables the public demo.
    // An HTTP response prevents the installed reader's network-error fallback.
    if(env.PUBLIC_DEMO_ENABLED!=='true')return new Response(request.method==='HEAD'?null:
      'The public Tuka demo is closed.\nVisit https://tuka.rand0m.net to request access.',{
      status:410,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex','X-Content-Type-Options':'nosniff'},
    });
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{
      status:405,headers:{Allow:'GET, HEAD'},
    });
    const url=new URL(request.url);
    try{
      if(url.pathname.startsWith('/api/')){
        // The public API validates its fixed routes and query parameters. Never
        // forward browser credentials or Origin across the service binding.
        const response=await env.PUBLIC_API.fetch(new Request(url,{
          method:request.method,headers:{Accept:'application/json'},
        }));
        const headers=new Headers(response.headers);
        for(const name of ['Set-Cookie','Access-Control-Allow-Credentials','Access-Control-Allow-Origin'])headers.delete(name);
        return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
      }
      if(url.pathname==='/')url.pathname='/index.html';
      const response=await env.ASSETS.fetch(new Request(url,request));
      return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
    }catch{
      console.error(JSON.stringify({event:'tuka_public_site_failed',path:url.pathname}));
      return new Response(request.method==='HEAD'?null:JSON.stringify({error:'Tuka is temporarily unavailable. Please try again.'}),{
        status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},
      });
    }
  },
};
