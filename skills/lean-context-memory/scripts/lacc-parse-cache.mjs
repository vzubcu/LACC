// RD-4 content-addressed parse-only cache. Opt-in and private.
// Entries NEVER cache trusted facts, Git verification, resolved edges or
// semantic correctness. Cache files are untrusted hints and fail closed.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { localPath, privateStore } from './lacc-core.mjs';

const FOLDER='memory/analysis-cache';
const MAX_ENTRY=16*1024;
const MAX_INPUT=128*1024;
const IDENT=/^[a-z][a-z0-9._-]{0,63}$/;
const hash=b=>createHash('sha256').update(b).digest('hex');
function shape(v){
  return v && typeof v==='object' && !Array.isArray(v) &&
    Array.isArray(v.imports) && v.imports.length<=128 &&
    v.imports.every(x=>typeof x==='string' &&
      Buffer.byteLength(x,'utf8')<=256 && !/[\x00-\x1f\x7f]/.test(x) &&
      !/(?:password|secret|token|api[_-]?key)\s*[:=]/i.test(x)) &&
    Array.isArray(v.unknown) && v.unknown.length<=128 &&
    v.unknown.every(x=>Number.isSafeInteger(x)&&x>=1&&x<=1000000) &&
    Object.keys(v).sort().join(',')==='imports,unknown';
}
function keyFor(parser,version,bytes){
  if(!IDENT.test(parser)||!IDENT.test(version))throw Error('invalid parser cache contract');
  if(!Buffer.isBuffer(bytes)||bytes.length>MAX_INPUT)
    throw Error('invalid parser cache input');
  return hash(Buffer.from('RD4\0'+parser+'\0'+version+'\0'+hash(bytes)));
}
function recordFor(key,parsed){
  const payload={schema:1,key,parsed};
  return {...payload,checksum:hash(JSON.stringify(payload))};
}
export function createParseCache(root,{enabled=false,maxEntries=128}={}){
  if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>256)
    throw Error('invalid parse cache limit');
  const memo=new Map(), stats={hits:0,misses:0,writes:0,rejected:0,revalidated:0};
  let attempted=0;
  return {
    stats,
    parse(parser,version,bytes,compute){
      if(typeof compute!=='function')throw Error('parse callback is required');
      if(!enabled)return compute();
      if(++attempted>maxEntries){ stats.rejected++; return compute(); }
      const key=keyFor(parser,version,bytes);
      if(memo.has(key)){stats.hits++;return structuredClone(memo.get(key));}
      const rel=FOLDER+'/'+key+'.json';
      const dest=localPath(root,rel);
      try{
        const stat=fs.lstatSync(dest);
        if(!stat.isFile()||stat.size>MAX_ENTRY)throw Error('invalid parse cache file');
        const raw=fs.readFileSync(dest,'utf8');
        const entry=JSON.parse(raw);
        const payload={schema:1,key,parsed:entry?.parsed};
        if(!entry||entry.schema!==1||entry.key!==key||
          !shape(entry.parsed) || entry.checksum!==hash(JSON.stringify(payload)))
          throw Error('invalid parse cache entry');
        // The on-disk cache is *not authenticated*. Independently reparse
        // before using it to construct any security-relevant graph edge.
        // Same-process memo hits avoid reparsing; disk hits are hints only.
        const verified=compute();
        if(!shape(verified)||JSON.stringify(verified)!==JSON.stringify(entry.parsed)){
          stats.rejected++;
          memo.set(key,structuredClone(verified));
          return verified;
        }
        stats.revalidated++;
        stats.hits++;
        memo.set(key,entry.parsed);
        return structuredClone(entry.parsed);
      }catch(error){
        if(error.code!=='ENOENT')stats.rejected++;
      }
      stats.misses++;
      const parsed=compute();
      if(!shape(parsed)){stats.rejected++;return parsed;}
      memo.set(key,structuredClone(parsed));
      const entry=JSON.stringify(recordFor(key,parsed))+'\n';
      if(Buffer.byteLength(entry,'utf8')>MAX_ENTRY){stats.rejected++;return parsed;}
      // Nested ignore file ensures ordinary Git add -A skips the cache.
      privateStore(root,FOLDER);
      try{
        fs.writeFileSync(localPath(root,rel),entry,{flag:'wx',mode:0o600});
        stats.writes++;
      }catch(error){
        if(error.code!=='EEXIST')throw error;
      }
      return parsed;
    },
  };
}
