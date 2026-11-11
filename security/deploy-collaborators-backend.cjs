// Operator-only Render deployment; no application credentials are read.
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const {execFileSync}=require('node:child_process');
const req=createRequire(path.resolve(__dirname,'../chtaw-team-backend/package.json'));
const yaml=req('js-yaml');
const serviceId='srv-dbo8v2u7bikc73895mhg';
async function main(){
  const config=yaml.load(fs.readFileSync(path.join(process.env.USERPROFILE,'.render','cli.yaml'),'utf8'));
  if(!config.api?.key)throw Error('Render operator credential unavailable');
  const request=async(route,body)=>{
    const response=await fetch(`https://api.render.com/v1${route}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${config.api.key}`,'Content-Type':'application/json',Accept:'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(`Render request failed (${response.status})`);
    return response.json();
  };
  const mode=process.argv[2]||'inspect';
  if(mode==='inspect'){
    const s=await request(`/services/${serviceId}`);
    console.log(JSON.stringify({id:s.id,name:s.name,branch:s.branch,autoDeploy:s.autoDeploy,rootDir:s.rootDir,suspended:s.suspended}));
  }else if(mode==='deploy'){
    const sha=process.argv[3];
    const head=execFileSync('git',['-c',`safe.directory=${path.resolve(__dirname,'..').replaceAll('\\','/')}`,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(!/^[a-f0-9]{40}$/.test(sha||'')||sha!==head)throw Error('Exact reviewed HEAD required');
    const d=await request(`/services/${serviceId}/deploys`,{commitId:sha,clearCache:'do_not_clear'});
    console.log(JSON.stringify({id:d.id,status:d.status,commit:d.commit?.id}));
  }else if(mode==='status'){
    const id=process.argv[3];if(!/^dep-[a-z0-9]+$/.test(id||''))throw Error('Deployment ID required');
    const d=await request(`/services/${serviceId}/deploys/${id}`);
    console.log(JSON.stringify({id:d.id,status:d.status,commit:d.commit?.id}));
  }else if(mode==='list'){
    const result=await request(`/services/${serviceId}/deploys?limit=4`);
    console.log(JSON.stringify(result.map(({deploy:d})=>({id:d.id,status:d.status,commit:d.commit?.id}))));
  }else throw Error('Unknown operator mode');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
