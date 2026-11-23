from pathlib import Path
import subprocess,tarfile,io,json,shutil
import argparse
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--contracts-root',default=str(Path(__file__).resolve().parents[2]/'Eventis-contracts'));a=p.parse_args()
r=Path(__file__).resolve().parents[1];out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True);ctx=out/'app';ctx.mkdir(exist_ok=True)
archive=subprocess.check_output(['git','archive','HEAD'],cwd=r)
with tarfile.open(fileobj=io.BytesIO(archive)) as t: t.extractall(ctx,filter='data')
# Include the production mode changes being validated for this deployment.
for name in subprocess.check_output(['git','ls-files','--modified','--others','--exclude-standard'],cwd=r,text=True).splitlines():
 src=r/name
 if src.is_file():
  target=ctx/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,target)
if not (r/'bun.lock').is_file(): raise RuntimeError('Run bun install first to produce bun.lock')
shutil.copy2(r/'bun.lock',ctx/'bun.lock')
for name in ['contracts','tsconfig','eslint-config']:
 source=Path(a.contracts_root)/'packages'/name
 target=ctx/'vendor'/name
 shutil.copytree(source,target,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git','*.tsbuildinfo'))
 p=target/'package.json';data=json.loads(p.read_text());data.pop('devDependencies',None);p.write_text(json.dumps(data,indent=2)+'\n')
p=ctx/'package.json';data=json.loads(p.read_text())
for section in ['dependencies','devDependencies']:
 for name in ['contracts','tsconfig','eslint-config']:
  key='@eventis/'+name
  if key in data.get(section,{}):data[section][key]='file:./vendor/'+name
p.write_text(json.dumps(data,indent=2)+'\n')
shutil.copy2(r/'docker/vps/Dockerfile',ctx/'Dockerfile.vps')
(ctx/'.dockerignore').write_text('.git\n.env\n.env.*\nnode_modules\ndist\nreports\n')
with tarfile.open(out/'app.tar.gz','w:gz') as t:t.add(ctx,arcname='app')
print('Prepared source bundle with shared packages; no environment files included')
