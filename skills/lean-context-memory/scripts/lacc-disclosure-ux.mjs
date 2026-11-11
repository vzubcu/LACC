// CR-4: bounded, task-scoped diagnostic presentation and optional
// agent-seen markers. No semantic revalidation, user delivery or silence.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { emitLimited, git, gitText, localPath, privateStore } from './lacc-core.mjs';

const TASK=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const ID=/^[a-f0-9]{24}$/;
const HEAD=/^[a-f0-9]{40}$/;
const KIND='agent-seen-marker';
const STORE='memory/disclosures';
const TTL_MS=7*24*60*60*1000;
const PRIORITY=Object.freeze({
  'evidence-unavailable':0,
  'source-drift':1,
  'indirect-dependency-drift':2,
  'potential-fact-conflict':3,
  'stale-checkpoint':4,
  'coverage-incomplete':5,
});
const sha=value=>createHash('sha256').update(value).digest('hex');
const safeTask=value=>{
  if(typeof value!=='string'||!TASK.test(value))throw Error('invalid disclosure task ID');
  return value;
};
const safeId=value=>{
  if(typeof value!=='string'||!ID.test(value))throw Error('invalid finding ID');
  return value;
};
const safeHead=value=>{
  if(typeof value!=='string'||!HEAD.test(value))throw Error('disclosure marker requires a verified Git HEAD');
  return value;
};
function head(root){
  const result=git(root,['rev-parse','--verify','HEAD']);
  return result.ok && HEAD.test(gitText(result))?gitText(result):null;
}
function safeFocus(value) {
  if (typeof value!=='string'||!value||Buffer.byteLength(value,'utf8')>240||
      /[\x00-\x1f\x7f\\]/.test(value)||
      /(?:password|secret|token|api[_-]?key)\s*[:=]/i.test(value)||
      value.startsWith('/')||/^[a-z]:/i.test(value)||
      value.split('/').some(part=>!part||part==='.'||part==='..'))
    return null;
  return value;
}
function issueId(finding){
  return safeId(finding?.finding_id);
}
function evidenceDigest(finding){
  // Never persist raw source paths, text or user-provided descriptions.
  // Bind an agent-seen marker to the *current diagnostic evidence*.
  return sha(JSON.stringify({
    id:issueId(finding),kind:finding.kind,revision:finding.fact?.verified_commit,
    paths:finding.evidence?.changed_paths,
    chain:finding.evidence?.dependency_chain,
    scope:finding.evidence?.verification_scope,
    trace:finding.evidence?.trace?.status,
    limitations:finding.coverage?.limitations,
  }));
}
function fileName(id,revision,digest,bucket){
  return id+'-'+revision+'-'+digest.slice(0,16)+'-'+bucket+'.json';
}
function relative(task,file){
  return STORE+'/'+task+'/'+file;
}
function readMarker(root,task,id,revision,digest,now){
  if(!revision)return false;
  const bucket=Math.floor(now/TTL_MS);
  // Check current and previous windows; expiry is measured from creation,
  // never by the coarse bucket alone. No directory-wide scan.
  for(const part of [bucket,bucket-1]){
    const dest=localPath(root,relative(task,fileName(id,revision,digest,part)));
    let data;
    try{
      const stat=fs.lstatSync(dest);
      if(!stat.isFile()||stat.size>1024)throw Error('invalid disclosure receipt type/size');
      data=JSON.parse(fs.readFileSync(dest,'utf8'));
    }catch(e){
      if(e.code==='ENOENT')continue;
      throw e; // tampered files never become valid suppressions
    }
    if(!data||data.schema!==1||data.kind!==KIND||data.task!==task||
        data.finding_id!==id||data.git_head!==revision||
        data.evidence_digest!==digest||data.user_delivery!=='not-observed'||
        typeof data.created_at!=='string')
      throw Error('invalid disclosure agent-seen marker');
    const millis=Date.parse(data.created_at);
    if(Number.isFinite(millis)&&millis<=now&&now-millis<=TTL_MS)return true;
  }
  return false;
}
export function groupDisclosureFindings(diagnostics,{
  task, gitHead=null, detail=false, maxGroups=6, markerReader=()=>false,
}={}){
  safeTask(task);
  if(!Array.isArray(diagnostics)||diagnostics.length>40)
    throw Error('invalid bounded disclosure findings');
  if(!Number.isSafeInteger(maxGroups)||maxGroups<1||maxGroups>10)
    throw Error('disclosure group limit must be 1..10');
  if(gitHead!==null)safeHead(gitHead);
  const groups=new Map(), unique=new Set();
  let seen=0, fresh=0, incomplete=0;
  for(const f of diagnostics){
    const id=issueId(f);
    if(unique.has(id))continue;
    unique.add(id);
    if(f.trust!=='review-required')throw Error('disclosure accepts review findings only');
    if(f.kind==='coverage-incomplete')incomplete++;
    const focus=safeFocus(f.evidence?.changed_paths?.[0])||
      safeFocus(f.evidence?.cited_sources?.[0])||
      safeFocus(f.fact?.location?.replace(/:\d+$/,''))||'memory/unknown';
    const groupId=sha('disclosure-group-v1:'+focus).slice(0,24);
    const marker=evidenceDigest(f);
    const wasSeen=Boolean(gitHead && markerReader({
      task, id, gitHead, evidenceDigest:marker,
    }));
    if(wasSeen)seen++;else fresh++;
    let g=groups.get(groupId);
    if(!g){
      g={
        group_id:groupId,focus,findings:0,new_findings:0,seen_markers:0,
        categories:new Set(),sample_ids:[],detail:[],
        priority:99,
      };
      groups.set(groupId,g);
    }
    g.findings++;
    g.new_findings+=Number(!wasSeen);
    g.seen_markers+=Number(wasSeen);
    g.categories.add(f.kind);
    g.priority=Math.min(g.priority,PRIORITY[f.kind]??6);
    if(g.sample_ids.length<3)g.sample_ids.push(id);
    if(detail && g.detail.length<4)g.detail.push({
      finding_id:id,kind:f.kind,location:safeFocus(f.fact?.location)||'unknown',
      recommended_action:f.recommended_action,
      trace_status:f.evidence?.trace?.status??'unavailable',
      seen_marker:wasSeen,
    });
  }
  const sorted=[...groups.values()].sort((a,b)=>
    Number(b.new_findings>0)-Number(a.new_findings>0) ||
    a.priority-b.priority || a.focus.localeCompare(b.focus,'en') ||
    a.group_id.localeCompare(b.group_id,'en'));
  const result=sorted.slice(0,maxGroups).map(g=>({
    group_id:g.group_id,focus:g.focus,
    findings:g.findings,new_findings:g.new_findings,
    seen_markers:g.seen_markers,
    kinds:[...g.categories].sort(),sample_ids:g.sample_ids.sort(),
    ...(detail?{details:g.detail}:{}),
  }));
  return {
    schema:1,mode:detail?'detail':'brief',
    task,git_head:gitHead,
    status:diagnostics.length?'review-required':'no-emitted-findings',
    total_findings:unique.size,total_groups:sorted.length,
    new_findings:fresh,seen_markers:seen,
    coverage_findings:incomplete,results:result,
    output_truncated:sorted.length>maxGroups,
    user_delivery:'not-observed',
    notification:'agent-output-only',
    notice:'Agent-seen never resolves, suppresses or proves user delivery.',
  };
}
export function buildDisclosureSummary(root,raw,{
  task,detail=false,limit=6,maxBytes=8192,now=Date.now(),
}={}){
  safeTask(task);
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.diagnostics))
    throw Error('expected CR-1 normalized diagnostics');
  const current=head(root);
  const reader=({id,gitHead,evidenceDigest})=>
    readMarker(root,task,id,gitHead,evidenceDigest,now);
  const output=groupDisclosureFindings(raw.diagnostics,{
    task,gitHead:current,detail,maxGroups:limit,markerReader:reader,
  });
  output.scan_incomplete=Boolean(raw.scan_incomplete||
    raw.diagnostics_truncated||raw.diagnostics_input_incomplete||
    raw.output_truncated||raw.status==='incomplete'||
    raw.diagnostics_total>raw.diagnostics.length);
  if(output.scan_incomplete)output.status='incomplete';
  output.unresolved_findings=output.total_findings;
  output.input_report_bytes=Buffer.byteLength(JSON.stringify(raw),'utf8');
  return emitLimited(output,maxBytes);
}
export function markDisclosureSeen(root,raw,{
  task,id,expectedHead,maxBytes=8192,now=Date.now(),
}={}){
  safeTask(task);safeId(id);safeHead(expectedHead);
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.diagnostics))
    throw Error('expected current normalized session diagnostics');
  const current=head(root);
  if(!current||current!==expectedHead)
    throw Error('Git HEAD mismatch; refuse stale disclosure marker');
  const f=raw.diagnostics.find(row=>row?.finding_id===id);
  if(!f||f.trust!=='review-required')
    throw Error('finding is not present in current bounded session scan');
  const digest=evidenceDigest(f);
  // Markers are advisory; never change a fact's trust, suppress an alert,
  // or report that a user saw this content.
  privateStore(root,STORE);
  const name=fileName(id,current,digest,Math.floor(now/TTL_MS));
  const dir=localPath(root,STORE+'/'+task);
  fs.mkdirSync(dir,{recursive:true});
  const dest=localPath(root,relative(task,name));
  const record={
    schema:1,kind:KIND,task,finding_id:id,
    git_head:current,evidence_digest:digest,
    created_at:new Date(now).toISOString(),user_delivery:'not-observed',
  };
  let status='created';
  try{
    fs.writeFileSync(dest,JSON.stringify(record)+'\n',{
      flag:'wx',mode:0o600,
    });
  }catch(e){
    if(e.code!=='EEXIST')throw e;
    // Tampering is never treated as a valid previously-seen marker.
    if(!readMarker(root,task,id,current,digest,now))
      throw Error('existing disclosure marker invalid or expired');
    status='existing';
  }
  return emitLimited({
    status,task,finding_id:id,git_head:current,
    marker:'agent-seen-only',user_delivery:'not-observed',
    finding_trust:'review-required',suppressed:false,
    note:'A seen marker is not user notification, semantic resolution or permission to bypass review.',
  },maxBytes);
}
