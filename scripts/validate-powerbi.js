'use strict';
// Validates every PBIP/PBIR document against Microsoft's published JSON schemas.
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require(require.resolve('ajv', { paths: [path.join(__dirname, '../client')] }));
const root = path.join(__dirname, '../powerbi/GCC_Requirements');
const cache = path.join(__dirname, '../powerbi/validation/schema-cache');
fs.mkdirSync(cache, { recursive: true });
async function loadSchema(uri) {
  const file = path.join(cache, Buffer.from(uri).toString('base64url') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!uri.startsWith('https://developer.microsoft.com/json-schemas/')) throw new Error('Unexpected schema host: ' + uri);
  const res = await fetch(uri);
  if (!res.ok) throw new Error('Schema HTTP ' + res.status + ': ' + uri);
  const schema = await res.json();
  fs.writeFileSync(file, JSON.stringify(schema));
  return schema;
}
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() && e.name !== '.pbi' ? files(path.join(dir, e.name)) : e.isFile() ? [path.join(dir, e.name)] : []);
}
(async () => {
  const ajv = new Ajv({ loadSchema, allErrors: true, schemaId: 'auto', unknownFormats: 'ignore', logger: false });
  let count=0;
  const errors=[];
  const model=JSON.parse(fs.readFileSync(path.join(root,'GCC_Requirements.SemanticModel/model.bim'),'utf8'));
  const entities=new Map(model.model.tables.map(t=>[t.name,new Set([...(t.columns||[]),...(t.measures||[])].map(c=>c.name))]));
  function checkFields(value,file) {
    if (!value || typeof value!=='object') return;
    for (const type of ['Column','Measure']) if(value[type]?.Expression?.SourceRef?.Entity) {
      const q=value[type];
      if(!entities.get(q.Expression.SourceRef.Entity)?.has(q.Property)) errors.push({file,error:'Unresolved report field',field:q});
    }
    Object.values(value).forEach(v=>checkFields(v,file));
  }
  for (const file of files(root).filter(f=>/\.(json|pbip|pbir|pbism)$/.test(f))) {
    const doc=JSON.parse(fs.readFileSync(file,'utf8'));
    if (!doc.$schema) continue;
    const validate=ajv.getSchema(doc.$schema) || await ajv.compileAsync(await loadSchema(doc.$schema));
    if(!validate(doc)) errors.push({file:path.relative(root,file),errors:validate.errors});
    checkFields(doc,path.relative(root,file)); count++;
  }
  const summary={documents:count,errors};
  fs.writeFileSync(path.join(__dirname,'../powerbi/validation/schema-validation.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2));
  if(errors.length) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
