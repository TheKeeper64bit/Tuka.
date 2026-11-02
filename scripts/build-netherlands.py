#!/usr/bin/env python3
"""Stream the national OVapi ZIP into a complete-trip Tilburg bus partition.
No national stop-time table is loaded into memory or shipped to a browser.
Usage: build-netherlands.py INPUT.zip OUTPUT_DIRECTORY
"""
import csv, io, json, zipfile, pathlib, sys, hashlib, datetime
from collections import defaultdict
from importlib.util import spec_from_file_location, module_from_spec
CORE=(5.00,51.49,5.16,51.63)
CONNECTION_AREA=(4.65,51.35,5.55,51.85)
def inside(s,b):
    try: return b[0]<=float(s['stop_lon'])<=b[2] and b[1]<=float(s['stop_lat'])<=b[3]
    except (ValueError,KeyError): return False

def build(source, output):
    output=pathlib.Path(output); output.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(source) as z:
        def rows(name):
            if name+'.txt' not in z.namelist(): return iter(())
            return csv.DictReader(io.TextIOWrapper(z.open(name+'.txt'),encoding='utf-8-sig',newline=''))
        def calls():
            stream=io.TextIOWrapper(z.open('stop_times.txt'),encoding='utf-8-sig',newline='');reader=csv.reader(stream);header=next(reader)
            return header,reader
        stops={s['stop_id']:s for s in rows('stops')}
        routes={r['route_id']:r for r in rows('routes') if r['route_type']=='3' or 700<=int(r['route_type'])<800}
        trips={t['trip_id']:t for t in rows('trips') if t['route_id'] in routes}
        core={sid for sid,s in stops.items() if inside(s,CORE)}
        area={sid for sid,s in stops.items() if inside(s,CONNECTION_AREA)}
        primary=set(); region_stops=defaultdict(set)
        header,reader=calls(); ti=header.index('trip_id');si=header.index('stop_id')
        count=0
        for row in reader:
            count+=1;sid=row[si]
            if sid not in area:continue
            trip=trips.get(row[ti])
            if not trip:continue
            route=trip['route_id'];region_stops[route].add(sid)
            if sid in core:primary.add(route)
        interchange=set().union(*(region_stops[r] for r in primary))
        selected=primary|{r for r,ids in region_stops.items() if ids&interchange}
        selected_trips={tid:t for tid,t in trips.items() if t['route_id'] in selected}
        del trips
        services={t['service_id'] for t in selected_trips.values()};shapes={t['shape_id'] for t in selected_trips.values() if t.get('shape_id')}
        regional=output/'tilburg-regional.zip';stop_ids=set();calls_written=0
        with zipfile.ZipFile(regional,'w',compression=zipfile.ZIP_DEFLATED) as out:
            def write(name,items,fields=None):
                it=iter(items);first=next(it,None)
                if first is None:return
                with io.TextIOWrapper(out.open(name+'.txt','w'),encoding='utf-8',newline='') as stream:
                    writer=csv.DictWriter(stream,fieldnames=fields or list(first));writer.writeheader();writer.writerow(first);writer.writerows(it)
            with io.TextIOWrapper(out.open('stop_times.txt','w'),encoding='utf-8',newline='') as stream:
                writer=csv.writer(stream);header,reader=calls();writer.writerow(header)
                for row in reader:
                    if row[ti] in selected_trips:
                        writer.writerow(row);stop_ids.add(row[si]);calls_written+=1
            # Retain parent stations for accessibility and transfer references.
            parent_ids={stops[s].get('parent_station') for s in stop_ids if s in stops};stop_ids|=parent_ids&stops.keys()
            selected_routes=[routes[r] for r in sorted(selected)];agencies={r.get('agency_id') for r in selected_routes}
            write('stops',(s for sid,s in stops.items() if sid in stop_ids));write('routes',selected_routes);write('trips',selected_trips.values())
            write('agency',(a for a in rows('agency') if a['agency_id'] in agencies))
            for name in ['calendar','calendar_dates']:write(name,(r for r in rows(name) if r['service_id'] in services))
            write('shapes',(r for r in rows('shapes') if r['shape_id'] in shapes))
            transfers=[r for r in rows('transfers') if r['from_stop_id'] in stop_ids and r['to_stop_id'] in stop_ids and all(not r.get(k) or r[k] in selected_trips for k in ['from_trip_id','to_trip_id']) and all(not r.get(k) or r[k] in selected for k in ['from_route_id','to_route_id'])]
            write('transfers',transfers)
            for name in ['feed_info','licenses']:write(name,rows(name))
        aliases={t.get('realtime_trip_id') for t in selected_trips.values() if t.get('realtime_trip_id')}
        report={'source':'https://gtfs.ovapi.nl/nl/gtfs-nl.zip','sha256':hashlib.file_digest(open(source,'rb'),'sha256').hexdigest(),'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'coreBounds':CORE,'connectionBounds':CONNECTION_AREA,'policy':'Complete bus routes touching Tilburg plus one transfer hop within the connection area; every selected trip retains all stops, including beyond both bounds.','nationwideStopTimes':count,'primaryRoutes':sorted(primary),'routes':len(selected),'trips':len(selected_trips),'stops':len(stop_ids),'stopTimes':calls_written,'transfers':len(transfers),'agencyIds':sorted(agencies),'outsideConnectionAreaStops':sum(not inside(stops[s],CONNECTION_AREA) for s in stop_ids),'shapeCount':len(shapes)}
        (output/'tilburg-ingestion.json').write_text(json.dumps(report,indent=2)+'\n')
        (output/'tilburg-index.json').write_text(json.dumps({'version':report['sha256'],'tripIds':list(selected_trips),'aliases':sorted(aliases),'routeIds':sorted(selected),'stopIds':sorted(stop_ids)},separators=(',',':')))
        print(json.dumps(report),flush=True)
    spec=spec_from_file_location('compiler',pathlib.Path(__file__).with_name('build-transit-feed.py'));mod=module_from_spec(spec);spec.loader.exec_module(mod)
    mod.build(str(regional),str(output/'tilburg-network.bin'),'tilburg','https://gtfs.ovapi.nl/nl/gtfs-nl.zip')
if __name__=='__main__':build(*sys.argv[1:])
