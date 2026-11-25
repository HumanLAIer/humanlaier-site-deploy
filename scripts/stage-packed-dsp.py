import pathlib,json,hashlib,zipfile,sys,math
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'streaming-lab/dsp-analysis-nov22'
sha=lambda b:hashlib.sha256(b).hexdigest()
pins={"dsp-0":"41bfcdb360c787c55c253c64975dffc03df96fbf9e897d365ae106c98353eba2","dsp-1":"54e1603d5569039d19804b794eb34f4cf02f60ffd8f22ed9251d3a0f4317e141","dsp-2":"208a7e46143892b0d6f0f1afed549f89232d9889a749cc748b2a5491f13ebd87","context-0":"9cc8082dfe46cf2706e7050e01e25eeca803dee3eb2a33728b97801ee28913ca","context-1":"8a8d5ac6878362a6911e377d89b14092d4fa2352b1c6f0886c2737b62724f12a","context-2":"0648f72296a97cd0eb4b60c226e447e16d76b1361465f960ad50ff1ed4335f2b"}
old=json.loads((root/'streaming-lab/architecture-decision-nov22/comparison.json').read_bytes())
video=json.loads((root/'streaming-lab/nine-tickers-nov22/video-manifest.json').read_bytes())
original=json.loads((root/'streaming-lab/nine-tickers-nov22/comparison.json').read_bytes())
run=45548543642
control_sha='22c1747f2760846641490431bfd6c67872e3fe891fd7a0e621341cdbcbb79125'
blocks={}
receipts=[]
for key,digest in pins.items():
    with zipfile.ZipFile(pathlib.Path(sys.argv[1])/(key+'.zip')) as z:
        assert z.namelist()==['comparison.json']
        raw=z.read('comparison.json')
    assert sha(raw)==digest
    d=json.loads(raw)
    assert d['schema']=='hl-packed-ablation-public-v1' and d['runId']==run and d['codeSha']=='ecbb9daa98e58a23f0c90d8432b74e20b4425148'
    assert d['controlComparisonSha256']==control_sha and d['controlRunId']==45546336355 and d['sourceMapFixed'] and d['joinSilenceFrames']==0
    assert d['sessionId']==video['sessionId']==old['sessionId'] and d['originalManifestSha256']==video['originalManifestSha256']
    assert d['humanAccuracyVerified'] is False and d['sourceWrites']==0 and d['lane10Status']=='RESERVED_PENDING_REVIEW'
    assert d['group']+'-'+str(d['shard'])==key and len(d['windows'])==7
    receipts.append({'shard':key,'sha256':digest,'newDecodes':d['newDecodes'],'evidenceWriteMetrics':d['evidenceWriteMetrics']})
    for b in d['windows']:
        w=b['window']; c=b['control']; assert w==c['window']
        assert c['prompt']=='' and c['runId']==45546336355
        x=blocks.setdefault(w['id'],{'window':w,'control':c,'cells':{}})
        assert x['window']==w and x['control']==c
        for v in b['cells']:
            assert v['window']==w and v['controlComparisonSha256']==control_sha and v['variant'] not in x['cells']
            x['cells'][v['variant']]=v
variants=['control','eq25','eq100','voice25','voice50','voice100','combined100','rms-control','static','voice25-static']
parts=[];offset=0
for i,p in enumerate(video['parts']):
    parts.append({**p,'offset':offset,'rawAudio':{'filename':original['parts'][i]['file'],'sha256':original['parts'][i]['sha256'],'frames':original['parts'][i]['frames']},'tracks':{k:old['tracks'][k][i] for k in ['B','E','G']}})
    offset+=p['sourceFrames']
assert offset==10042710
windows=[]
for i in range(21):
    key='music-only-packed-'+str(i).zfill(3); b=blocks[key];w=b['window'];c=b['control'];part=next(p for p in parts if p['part']==w['part'])
    end=0;prev=-1
    for m in w['map']:
        assert m['sourceStartFrame']>=prev and m['sourceEndFrame']<=part['sourceFrames'] and m['sourceEndFrame']>m['sourceStartFrame']
        assert m['inputStartFrame']==end and m['insertedSilenceBeforeFrames']==0
        assert m['sourceGlobalStartFrame']==part['offset']+m['sourceStartFrame'] and m['sourceGlobalEndFrame']==part['offset']+m['sourceEndFrame']
        end+=m['sourceEndFrame']-m['sourceStartFrame']; assert m['inputEndFrame']==end;prev=m['sourceEndFrame']
    assert end==w['inputFrames'] and 0<end<=464000
    cells=[]
    for name in variants:
        v=c if name=='control' else b['cells'][name]
        if v.get('status')=='not_decoded':
            cells.append({'variant':name,'status':'not_decoded','reason':v['reason']});continue
        assert v['window']==w and isinstance(v['text'],str) and len(v['inputPcmSha256'])==64
        assert not v['tokenLimitReached']
        cells.append({'variant':name,'status':v.get('status','reused_control'),'text':v['text'],'inputPcmSha256':v['inputPcmSha256'],'scoreCount':v['scoreCount'],'meanSelectedTokenLogScore':v['meanSelectedTokenLogScore'],'sourceWordTimestamps':v['sourceWordTimestamps'],'sourceSegments':v['sourceSegments'],'acoustics':v.get('acoustics',{'inputRmsDbfs':c['inputRmsDbfs'],'rmsChangeDb':0,'relativeWaveformRms':0}),'gainDiagnostic':v.get('gainDiagnostic'),'prompt':v['prompt'],'callMetrics':v.get('callMetrics'),'nativeReceiptSha256':v['nativeReceipt']['sha256']})
    windows.append({'id':key,'index':i,'part':w['part'],'startFrame':w['map'][0]['sourceGlobalStartFrame'],'endFrame':w['map'][-1]['sourceGlobalEndFrame'],'inputFrames':end,'map':w['map'],'cells':cells})
assert sum(w['inputFrames'] for w in windows)==9309590
review=[{'slug':'repetition','window':1,'label':'Repeated “ah” / missing speech','question':'Are the repeated ah sounds real? What, if anything, is being said instead?'},{'slug':'focus-fighters','window':2,'label':'Focus fighters','question':'Confirm the phrase and surrounding speech. All DSP doses preserve it.'},{'slug':'start-bid','window':5,'label':'Start bid / start beat','question':'What is the auction-price phrase? Does the full context agree?'},{'slug':'been-a-while','window':11,'label':'Been a while','question':'Which opening phrase is actually spoken?'},{'slug':'togekiss','window':12,'label':'Togekiss / repeated syllables','question':'Is the product name Togekiss? What else is actually spoken here?'},{'slug':'normal-milk','window':13,'label':'Normal milk / product name','question':'What is the actual phrase or product name after “last one Thomas”?'},{'slug':'shout-out','window':18,'label':'Shout out / shut out','question':'Which wording is audible? If possible, check the names too.'}]
d={'schema':'hl-packed-dsp-lab-v1','runId':run,'codeSha':'ecbb9daa98e58a23f0c90d8432b74e20b4425148','sessionId':video['sessionId'],'originalManifestSha256':video['originalManifestSha256'],'controlComparisonSha256':control_sha,'controlRunId':45546336355,'sourceFrames':offset,'retainedFrames':9309590,'sampleRate':16000,'parts':parts,'windows':windows,'reviews':review,'receipts':receipts,'humanAccuracyVerified':False,'wordTimingVerified':False,'lane10Status':'RESERVED_PENDING_REVIEW'}
out.mkdir(parents=True,exist_ok=True)
raw=(json.dumps(d,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode()
(out/'comparison.json').write_bytes(raw)
(out/'evidence.json').write_text(json.dumps({'schema':'hl-packed-dsp-export-v1','comparisonSha256':sha(raw),'comparisonBytes':len(raw),'runId':run,'controlComparisonSha256':control_sha,'shards':pins},indent=2)+'\n')
print('HL_DSP_PROJECTION',sha(raw),len(raw))
