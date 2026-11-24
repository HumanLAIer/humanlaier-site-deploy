"""Project verified speaker-role evidence; no inference or media modifications."""
import argparse, hashlib,io,json,math,zipfile
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/"streaming-lab/speaker-roles-nov22"
N=10042710;H=160;SID="20261122T205428_176734Z_huatzaitcg"
def sha(b):return hashlib.sha256(b).hexdigest()
def check(b,s):
    if sha(b)!=s:raise ValueError("digest mismatch "+s)
    return b
def zfile(path,s):
    return zipfile.ZipFile(io.BytesIO(check(Path(path).read_bytes(),s)))
def runs(x):
    d=np.flatnonzero(np.diff(np.r_[False,x.astype(bool),False]))
    return [(int(a),int(b)) for a,b in zip(d[::2],d[1::2])]
def spans(x):return [[a*H,min(N,b*H)] for a,b in runs(x)]
def padding(x,parts,p):
    n=len(x);delta=np.zeros(n+1,np.int32)
    for part in parts:
        lo=part["startFrame"]//H;hi=min(n,(part["endFrame"]+H-1)//H)
        for a,b in runs(x[lo:hi]):
            delta[max(lo,lo+a-round(p*100))]+=1;delta[min(hi,lo+b+round(p*100))]-=1
    return np.cumsum(delta[:-1])>0
def retained(mask):
    ranges=spans(mask);tail=len(mask)*H
    if tail<N:
        if ranges and ranges[-1][1]==tail:ranges[-1][1]=N
        else:ranges.append([tail,N])
    return ranges,sum(b-a for a,b in ranges)
def activity(x):
    bit=(x*np.array([1<<i for i in range(8)],np.uint16)).sum(1)
    e=np.r_[0,np.flatnonzero(bit[1:]!=bit[:-1])+1,len(bit)]
    return [[int(a)*H,int(b)*H,int(bit[a])] for a,b in zip(e[:-1],e[1:]) if bit[a]]
def main(a):
    with zfile(a.diar,"7bfc13f88674eb1e15f939a336e8e40962fc70913ee25e38087d79fe9659ea7e") as f:
        dr=check(f.read("receipt.json"),"d1c5561624ed41bbbf2b10d834ed737bb7fc1a386512863d77423f5d3140cef9")
        lr=check(f.read("native-speaker-logits.npy"),"582413725f3ee76a3c2f1517052f9215745735ce4e43534cedce2530d13c4736")
    with zfile(a.audio,"39a873634c6199b35734dbfab0c38334f0d6d81111a93512ba25695bb6e1b7ed") as f:
        rr=check(f.read("full/report.json"),"57fbcd68bf766009eb06d445ab062f1511f137242904c34e8643b04e17950bdd")
        yr=check(f.read("full/native-yamnet-scores.npy"),"770ccfde533b82010df843b935a14a65c39d0a6ecffe95ca7d0649acdba34fa5")
        sr=check(f.read("smoke/report.json"),"f9ac2d6ee6399647ebf53199833ee6e106b0bacd6b9feb1f0c205fc4c5a5ce69")
        check(f.read("smoke/native-yamnet-scores.npy"),json.loads(sr)["nativeScores"]["sha256"])
    with zfile(a.context,"98f322dc749d81f5788f221126e3f962e368bec062510d92c5b7ae898dcd7137") as f:zr=f.read("context-replay.json")
    d,r,s,z=map(json.loads,(dr,rr,sr,zr));x=np.load(io.BytesIO(lr),allow_pickle=False);scores=np.load(io.BytesIO(yr),allow_pickle=False)
    assert all(j["sessionId"]==SID for j in (d,r,s,z)) and x.shape==(62766,8) and scores.shape==(1303,521)
    assert np.isfinite(x).all() and np.isfinite(scores).all() and z["sourceReportSha256"]==sha(rr) and z["nativeLogitsSha256"]==sha(lr) and z["nativeYamnetScoresSha256"]==sha(yr) and not z["hardSuppression"]
    v=json.loads((ROOT/"streaming-lab/nine-tickers-nov22/video-manifest.json").read_bytes());assert v["sessionId"]==SID and v["originalManifestSha256"]==d["originalManifestSha256"]
    parts=[];offset=0
    for p,o in zip(v["parts"],d["sourceParts"]):
        assert p["sourceFrames"]==o["endFrame"]-o["startFrame"] and p["sourcePcmSha256"]==o["sourcePcmSha256"] and p["sourcePartSha256"]==o["originalSha256"]
        parts.append({k:p[k] for k in ("part","filename","sourceFrames","mediaSeconds","pcmOriginMediaSeconds","sha256")}|{"startFrame":offset,"endFrame":offset+p["sourceFrames"]});offset+=p["sourceFrames"]
    assert offset==N
    q=z["thresholds"];music=np.zeros(x.shape,bool);protected=np.zeros(x.shape,bool)
    def context(w):return w["musicScore"]>=q["musicContextFloor"] and w["musicScore"]>=w["spokenScore"]+q["musicOverSpeechMargin"] and w["spokenScore"]<q["speechGuard"]
    windows=[];labels=r["model"]["labels"];spoken=("Speech","Conversation","Narration, monologue","Male speech, man speaking","Female speech, woman speaking")
    for w,row in zip(r["windows"],scores):
        a,b=w["startFrame"],w["endFrame"];assert b-a==15600 and any(p["startFrame"]<=a<b<=p["endFrame"] for p in parts)
        for k,l in (("musicScore","Music"),("singingScore","Singing"),("rapScore","Rapping")):assert w[k]==float(row[labels.index(l)])
        assert w["spokenScore"]==max(float(row[labels.index(l)]) for l in spoken if l in labels)
        for i in w["top"]:assert i["score"]==float(row[labels.index(i["label"])])
        windows.append({k:w[k] for k in ("startFrame","endFrame","slot","overlapFraction","unknownFrames","spokenScore","musicScore","singingScore","rapScore","top")})
    for slot,c in z["roles"].items():
        i=int(slot)
        if c["role"] not in ("background_music_candidate","music_dominant_mixed_candidate"):continue
        for w in windows:
            a,b=w["startFrame"],w["endFrame"]
            if w["slot"]==i and w["overlapFraction"]==0 and w["unknownFrames"]==0:
                lo,hi=(a+H-1)//H,min(len(x),b//H)
                if context(w):music[lo:hi,i]=True
                else:protected[lo:hi,i]=True
            if w["spokenScore"]>=q["speechGuard"] and w["slot"] in (None,i):protected[a//H:min(len(x),(b+H-1)//H),i]=True
    gates=[]
    for t in (.25,.35,.5):
        active=x>math.log(t/(1-t));removed=(active&music&~protected).any(1)&(active.sum(1)==1);keep=active.any(1)&~removed;act=activity(active)
        for p in (0,.25,.5,1,3,6):
            am=padding(active.any(1),parts,p);rm=padding(keep,parts,p);ar,an=retained(am);br,bn=retained(rm)
            ref=next(i for i in z["coverageSensitivity"] if i["threshold"]==t and i["paddingSeconds"]==p)
            assert (an,bn)==(ref["allDetected"]["retainedSamplesApprox"],ref["musicContextShadow"]["retainedSamplesApprox"])
            assert abs(float(removed.sum()/100)-ref["locallyRemovedBeforePaddingSeconds"])<1e-8
            gates.append(dict(threshold=t,paddingSeconds=p,activity=act,removed=spans(removed&~rm),allRetained=ar,roleRetained=br,allRetainedSamples=an,roleRetainedSamples=bn))
    roles=[];lex={}
    for k,c in r["roles"].items():
        i=int(k)
        for item in c["lexicalEvidence"]:
            assert item["id"] not in lex
            lex[item["id"]]=(i,item)
        roles.append(dict(slot=i,classification=z["roles"][k],features=c["acousticTemporalFeatures"],listeningLabel=c["listeningLabel"],audienceAddressBlocks=sum(bool(w["audienceAddress"]) for w in c["lexicalEvidence"])))
    base=check((ROOT/"streaming-lab/ten-tickers-nov22/comparison.json").read_bytes(),"926e53149c424a7498205eecb1657e8acbf1394d42c033dcd77cef4bbecb1ffc")
    by={p["part"]:p for p in parts};clips=[]
    for c in json.loads(base)["clips"]:
        o=by[c["sourcePart"]]["startFrame"];a,b=o+c["startFrame"],o+c["endFrame"];text=c["texts"]["singlish-small--control"];slot=None
        if c["id"] in lex:
            slot,item=lex[c["id"]];assert (a,b,text)==(item["startFrame"],item["endFrame"],item["text"])
        clips.append([a,b,c["id"],text,slot])
    samples=s["samples"]
    for w in samples:assert {"startFrame":w["startFrame"],"endFrame":w["endFrame"]} in d["enrollmentCandidates"]["speaker_"+str(w["slot"])]
    assert len(samples)==9 and len(clips)==43 and len(roles)==3
    doc=dict(schema="hl-speaker-roles-demo-v1",sessionId=SID,totalFrames=N,sampleRate=16000,nativeHopSamples=H,parts=parts,roles=roles,windows=windows,gates=gates,samples=samples,clips=clips,runtime=dict(nemotronSeconds=d["inferenceSeconds"],yamnetSeconds=r["inferenceAndWindowFeaturesSeconds"]),provenance={"Original manifest SHA-256":d["originalManifestSha256"],"Nemotron receipt SHA-256":sha(dr),"Nemotron native logits SHA-256":sha(lr),"YAMNet report SHA-256":sha(rr),"YAMNet native scores SHA-256":sha(yr),"YAMNet model SHA-256":r["model"]["weightSha256"],"Context replay SHA-256":sha(zr),"Existing dialogue comparison SHA-256":sha(base)},developmentOnly=True,hardSuppression=False,humanAccuracyVerified=False,rulesTunedOnDevelopmentRecording=True)
    raw=json.dumps(doc,sort_keys=True,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()
    OUT.mkdir(parents=True,exist_ok=True);(OUT/"role-data.json").write_bytes(raw)
    print("HL_SPEAKER_DEMO_STAGE "+json.dumps(dict(bytes=len(raw),sha256=sha(raw),windows=len(windows),samples=len(samples),gateScenarios=len(gates),replayParity=True)))
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--diar",required=True);p.add_argument("--audio",required=True);p.add_argument("--context",required=True);main(p.parse_args())
