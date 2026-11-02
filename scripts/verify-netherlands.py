#!/usr/bin/env python3
"""Compare EVERY retained call against the original national feed, not the compiler.
Usage: verify-netherlands.py NATIONAL.zip REGIONAL.bin REPORT.json
"""
import csv,io,zipfile,gzip,json,sys,hashlib,datetime
from collections import Counter
source,asset,output=sys.argv[1:]
with gzip.open(asset,'rt') as f:data=json.load(f)
expected={}
for trip,(pattern,start) in data['runs'].items():
    expected[trip]={seq:(stop,None if arr is None else arr+start,None if dep is None else dep+start,pick,drop) for stop,seq,arr,dep,pick,drop in data['patterns'][pattern]}
count=0;night=0;seen=Counter()
def seconds(s):
    if not s:return None
    h,m,s=map(int,s.split(':'));return h*3600+m*60+s
with zipfile.ZipFile(source) as z:
    reader=csv.reader(io.TextIOWrapper(z.open('stop_times.txt'),encoding='utf-8-sig',newline=''));header=next(reader);idx={k:header.index(k) for k in ['trip_id','stop_id','stop_sequence','arrival_time','departure_time','pickup_type','drop_off_type']}
    for row in reader:
        trip=row[idx['trip_id']]
        if trip not in expected:continue
        seq=int(row[idx['stop_sequence']]);arr=row[idx['arrival_time']];dep=row[idx['departure_time']]
        original=(row[idx['stop_id']],seconds(arr or dep),seconds(dep or arr),row[idx['pickup_type']],row[idx['drop_off_type']])
        assert expected[trip].pop(seq,None)==original,(trip,seq,'call changed or missing')
        count+=1;seen[trip]+=1;night+=int(original[2] is not None and original[2]>=86400)
    assert all(not calls for calls in expected.values()),'Compact asset contains calls missing from national source'
    assert len(seen)==len(data['runs'])
report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSha256':hashlib.file_digest(open(source,'rb'),'sha256').hexdigest(),'assetSha256':hashlib.file_digest(open(asset,'rb'),'sha256').hexdigest(),'exactCallsCompared':count,'completeTripsCompared':len(seen),'afterMidnightCalls':night,'mismatches':0,'method':'Every regional call compared with the national ZIP: trip ID, stop ID, sequence, arrival/departure seconds, pickup and drop-off restrictions. No missing or additional retained-trip calls.'}
with open(output,'w')as f:json.dump(report,f,indent=2);f.write('\n')
print(json.dumps(report))
