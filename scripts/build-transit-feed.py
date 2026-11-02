#!/usr/bin/env python3
"""Compile an official GTFS ZIP into a lossless bus schedule asset.
Repeated timing patterns are stored once. No service date or departure sampling.
Usage: build-transit-feed.py feed.zip dist/CITY-network.bin CITY OFFICIAL_URL
"""
import csv, io, json, gzip, zipfile, sys, hashlib
from collections import defaultdict

def build(source, target, city='boston', source_url='https://cdn.mbta.com/MBTA_GTFS.zip'):
    with zipfile.ZipFile(source) as z:
        def rows(name):
            if name not in z.namelist(): return iter(())
            return csv.DictReader(io.TextIOWrapper(z.open(name), encoding='utf-8-sig', newline=''))
        routes=[r for r in rows('routes.txt') if r['route_type']=='3' or 700<=int(r['route_type'])<800]
        route_ids={r['route_id'] for r in routes}
        trips=[t for t in rows('trips.txt') if t['route_id'] in route_ids]
        trip_ids={t['trip_id'] for t in trips}
        calls=defaultdict(list); stop_ids=set()
        def seconds(s):
            try:
                h,m,s=map(int,s.split(':')); return h*3600+m*60+s
            except (ValueError,AttributeError): return None
        for r in rows('stop_times.txt'):
            if r['trip_id'] not in trip_ids: continue
            stop_ids.add(r['stop_id'])
            calls[r['trip_id']].append([r['stop_id'],int(r['stop_sequence']),seconds(r['arrival_time'] or r['departure_time']),seconds(r['departure_time'] or r['arrival_time']),r.get('pickup_type',''),r.get('drop_off_type','')])
        patterns=[]; pattern_index={}; runs={}
        for trip in trips:
            path=sorted(calls.pop(trip['trip_id'],[]),key=lambda x:x[1])
            start=next((r[2] for r in path if r[2] is not None),0)
            pattern=[[s,q,None if a is None else a-start,None if d is None else d-start,p,b] for s,q,a,d,p,b in path]
            key=json.dumps(pattern,separators=(',',':'))
            if key not in pattern_index: pattern_index[key]=len(patterns); patterns.append(pattern)
            runs[trip['trip_id']]=[pattern_index[key],start]
        shape_ids={t.get('shape_id') for t in trips}; shapes=defaultdict(list)
        for r in rows('shapes.txt'):
            if r['shape_id'] in shape_ids: shapes[r['shape_id']].append([float(r['shape_pt_lon']),float(r['shape_pt_lat']),int(r['shape_pt_sequence'])])
        for shape in shapes.values(): shape.sort(key=lambda x:x[2])
        result={'format':'tuka-gtfs-patterns-v1','cityId':city,'source':source_url,'sha256':hashlib.file_digest(open(source,'rb'),'sha256').hexdigest(),'tables':{name:list(rows(name+'.txt')) for name in ['agency','calendar','calendar_dates','feed_info','transfers','licenses']},'patterns':patterns,'runs':runs,'shapes':dict(shapes)}
        all_stops=list(rows('stops.txt'));stop_ids|={s.get('parent_station') for s in all_stops if s['stop_id'] in stop_ids}
        result['tables'].update(stops=[s for s in all_stops if s['stop_id'] in stop_ids],routes=routes,trips=trips)
        raw=json.dumps(result,separators=(',',':')).encode()
        with open(target,'wb') as f: f.write(gzip.compress(raw,mtime=0))
        print(json.dumps({'stops':len(result['tables']['stops']),'routes':len(routes),'trips':len(trips),'patterns':len(patterns),'bytes':len(raw),'compressed':__import__('os').path.getsize(target)}))
if __name__=='__main__': build(*sys.argv[1:])
