#!/usr/bin/env python3
"""Stage only the exact verified architecture export. No inference or source changes."""
import argparse,hashlib,json,re,stat,subprocess,tempfile,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"streaming-lab/architecture-decision-nov22"
NAMES={"comparison.json","export-manifest.json"}|{f"listen-{p}-{i}.flac" for p in ("B","C","D","E","F","G","H","gate") for i in (1,2,3)}
def sha(p):
    h=hashlib.sha256()
    with Path(p).open("rb") as f:
        for b in iter(lambda:f.read(1024*1024),b""):h.update(b)
    return h.hexdigest()
def main(a):
    for v in (a.archive_sha256,a.manifest_sha256):
        if not re.fullmatch("[a-f0-9]{64}",v):raise ValueError("independent digest required")
    if not 0<a.archive_bytes<=250_000_000:raise ValueError("archive size cap")
    archive=Path(a.archive)
    if archive.stat().st_size!=a.archive_bytes or sha(archive)!=a.archive_sha256:raise ValueError("archive digest or length")
    with tempfile.TemporaryDirectory() as tmp:
        target=Path(tmp);seen=set()
        with zipfile.ZipFile(archive) as z:
            for i in z.infolist():
                if i.filename not in NAMES or i.filename in seen or i.is_dir() or stat.S_ISLNK(i.external_attr>>16) or not 0<i.file_size<=32_000_000:
                    raise ValueError("unexpected archive entry")
                seen.add(i.filename)
                with z.open(i) as source,(target/i.filename).open("xb") as dest:
                    while True:
                        b=source.read(1024*1024)
                        if not b:break
                        dest.write(b)
            if seen!=NAMES:raise ValueError("incomplete archive")
        if sha(target/"export-manifest.json")!=a.manifest_sha256:raise ValueError("export manifest digest")
        subprocess.run(["node",str(ROOT/"scripts/verify-architecture-decision.cjs"),str(target)],check=True,cwd=ROOT)
        for n in sorted(NAMES):
            dest=OUT/n
            if dest.exists():
                if sha(dest)!=sha(target/n):raise ValueError("immutable public output already exists and differs")
            else:dest.write_bytes((target/n).read_bytes())
        print("HL_ARCHITECTURE_STAGE_PASS "+json.dumps({"files":len(NAMES),"archiveSha256":a.archive_sha256,"manifestSha256":a.manifest_sha256}))
if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--archive",required=True);p.add_argument("--archive-sha256",required=True);p.add_argument("--archive-bytes",required=True,type=int);p.add_argument("--manifest-sha256",required=True)
    main(p.parse_args())
