#!/usr/bin/env python3
"""Produce a provider-neutral GTFS diagnostic report.

Usage: python3 scripts/diagnose-gtfs.py /path/feed.zip reports/feed.json --date 2026-10-29 --stop 1
"""
import csv, datetime as dt, json, math, sys, urllib.parse, urllib.request, zipfile
from collections import defaultdict, Counter

REQUIRED = ['agency.txt','stops.txt','routes.txt','trips.txt','stop_times.txt','shapes.txt','calendar.txt','calendar_dates.txt']

def read_rows(z, name):
    if name not in z.namelist(): return []
    with z.open(name) as f:
        return list(csv.DictReader((line.decode('utf-8-sig') for line in f)))

def parse_date(value):
    return dt.datetime.strptime(value.replace('-', ''), '%Y%m%d').date()

def active_service_ids(cal, exceptions, day):
    weekday = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'][day.weekday()]
    active = {r['service_id'] for r in cal if r.get('start_date') and r.get('end_date') and parse_date(r['start_date']) <= day <= parse_date(r['end_date']) and r.get(weekday) == '1'}
    for e in exceptions:
        if e.get('date') != day.strftime('%Y%m%d'): continue
        if e.get('exception_type') == '1': active.add(e['service_id'])
        elif e.get('exception_type') == '2': active.discard(e['service_id'])
    return sorted(active)

def seconds(value):
    try:
        h,m,s = (int(x) for x in value.split(':'))
        return h*3600+m*60+s
    except Exception: return None

def valid_point(lat, lon):
    return isinstance(lat,(int,float)) and isinstance(lon,(int,float)) and math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180

def number(value):
    try:
        parsed=float(value)
        return parsed if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None

def distance_m(a,b):
    return math.hypot((a[1]-b[1])*111000, (a[0]-b[0])*111000*math.cos(math.radians((a[1]+b[1])/2)))

def shape_is_credible(points, stop_points):
    if len(points) < 2 or len(stop_points) < 2: return False
    west=min(p[0] for p in stop_points); east=max(p[0] for p in stop_points); south=min(p[1] for p in stop_points); north=max(p[1] for p in stop_points)
    lon_pad=5000/(111000*max(0.2, math.cos(math.radians((south+north)/2))))
    if any(x < west-lon_pad or x > east+lon_pad or y < south-5000/111000 or y > north+5000/111000 for x,y in points): return False
    length=sum(distance_m(points[i-1],p) for i,p in enumerate(points) if i)
    outline=sum(distance_m(stop_points[i-1],p) for i,p in enumerate(stop_points) if i)
    return length <= outline*4+5000

def realtime_probe(stop, trip_ids):
    base='https://api-v3.mbta.com'
    result={'checked':True,'provider':'MBTA V3 API','vehicles':{'status':None,'count':None},'predictions':{'status':None,'count':None},'tripMatching':'not checked'}
    urls={'vehicles':base+'/vehicles?filter%5Broute_type%5D=3&page%5Blimit%5D=1'}
    if stop: urls['predictions']=base+'/predictions?filter%5Bstop%5D='+urllib.parse.quote(stop)+'&filter%5Broute_type%5D=3&include=trip&page%5Blimit%5D=5'
    for key,url in urls.items():
        try:
            with urllib.request.urlopen(url, timeout=10) as response:
                data=json.load(response); result[key]['status']=response.status; result[key]['count']=len(data.get('data',[]))
                if key=='predictions':
                    ids={item.get('relationships',{}).get('trip',{}).get('data',{}).get('id') for item in data.get('data',[])}
                    ids.discard(None); result['tripMatching']={'providerTrips':len(ids),'matchedTrips':len(ids & trip_ids),'unmatchedTrips':len(ids - trip_ids)}
        except Exception as exc: result[key]['error']=type(exc).__name__
    if not stop: result['tripMatching']='requires selected stop'
    return result

def main():
    if len(sys.argv) < 3: raise SystemExit('usage: diagnose-gtfs.py FEED.zip OUTPUT.json [--date YYYY-MM-DD] [--stop STOP_ID] [--realtime-url URL]')
    feed, output = sys.argv[1:3]; selected=dt.date.today(); stop=''
    i=3
    while i < len(sys.argv):
        if sys.argv[i]=='--date': selected=parse_date(sys.argv[i+1]); i+=2
        elif sys.argv[i]=='--stop': stop=sys.argv[i+1]; i+=2
        else: i+=1
    with zipfile.ZipFile(feed) as z:
        names=set(z.namelist()); missing=[x for x in REQUIRED if x not in names]
        stops=read_rows(z,'stops.txt'); routes=read_rows(z,'routes.txt'); trips=read_rows(z,'trips.txt'); stop_times=read_rows(z,'stop_times.txt'); shapes=read_rows(z,'shapes.txt'); calendar=read_rows(z,'calendar.txt'); exceptions=read_rows(z,'calendar_dates.txt')
    stop_by_id={r.get('stop_id'):r for r in stops}; route_by_id={r.get('route_id'):r for r in routes}; trip_by_id={r.get('trip_id'):r for r in trips}
    parsed_stops={sid:(number(r.get('stop_lon')),number(r.get('stop_lat'))) for sid,r in stop_by_id.items()}
    valid_stops={sid for sid,(lon,lat) in parsed_stops.items() if lon is not None and lat is not None and valid_point(lat,lon)}
    invalid_coords=[]
    for row in stops:
        if not row.get('stop_id'): continue
        lon,lat=parsed_stops.get(row['stop_id'],(None,None))
        if not valid_point(lat,lon): invalid_coords.append(row['stop_id'])
    times_by_trip=defaultdict(list); missing_trip=missing_stop=0
    for row in stop_times:
        if row.get('trip_id') not in trip_by_id: missing_trip+=1
        if row.get('stop_id') not in stop_by_id: missing_stop+=1
        times_by_trip[row.get('trip_id')].append(row)
    short_trips=[tid for tid,rows in times_by_trip.items() if len({r.get('stop_id') for r in rows if r.get('stop_id') in valid_stops})<2]
    shape_groups=defaultdict(list)
    for row in shapes:
        try: point=(float(row['shape_pt_lon']),float(row['shape_pt_lat']))
        except Exception: continue
        shape_groups[row.get('shape_id')].append((int(row.get('shape_pt_sequence') or 0),point))
    shape_groups={sid:[p for _,p in sorted(points)] for sid,points in shape_groups.items()}
    used_shape_ids={t.get('shape_id') for t in trips if t.get('shape_id')}
    rejected=[]; shape_reference={}
    for tid,t in trip_by_id.items():
        sid=t.get('shape_id')
        if not sid or sid in shape_reference: continue
        rows=sorted(times_by_trip.get(tid,[]),key=lambda r:int(r.get('stop_sequence') or 0)); ref=[]
        for row in rows:
            stoprow=stop_by_id.get(row.get('stop_id'))
            if stoprow:
                lon,lat=parsed_stops.get(row.get('stop_id'),(None,None))
                if lon is not None and lat is not None and valid_point(lat,lon): ref.append((lon,lat))
        shape_reference[sid]=ref
    for sid,pts in shape_groups.items():
        if sid in shape_reference and len(pts)>1 and not shape_is_credible(pts,shape_reference[sid]): rejected.append(sid)
    services=active_service_ids(calendar,exceptions,selected)
    departures=[]
    if stop and stop in stop_by_id:
        for row in stop_times:
            if row.get('stop_id')==stop and trip_by_id.get(row.get('trip_id'),{}).get('service_id') in services:
                departures.append({'tripId':row.get('trip_id'),'routeId':trip_by_id[row['trip_id']].get('route_id'),'departure':row.get('departure_time') or row.get('arrival_time')})
        departures.sort(key=lambda r: seconds(r['departure']) if seconds(r['departure']) is not None else 10**9)
    report={'generatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'feed':feed,'selectedDate':selected.isoformat(),'selectedStop':stop or None,'requiredFiles':{name:name in names for name in REQUIRED},'missingRequiredFiles':missing,'counts':{'stops':len(stops),'routes':len(routes),'trips':len(trips),'stopTimes':len(stop_times),'shapes':len(shape_groups),'shapePoints':sum(len(x) for x in shape_groups.values()),'calendarRows':len(calendar),'calendarExceptions':len(exceptions)},'relationships':{'missingTripReferencesInStopTimes':missing_trip,'missingStopReferencesInStopTimes':missing_stop,'invalidStopCoordinates':len(invalid_coords),'invalidStopIds':invalid_coords[:100],'tripsWithFewerThanTwoUsableStops':len(short_trips),'shortTripIds':short_trips[:100]},'routeTypes':dict(Counter(r.get('route_type') for r in routes)),'shapeCoverage':{'tripsWithShape':sum(bool(t.get('shape_id')) for t in trips),'usedShapeIds':len(used_shape_ids),'rejectedShapeIds':len(set(rejected)),'rejectedShapeSamples':sorted(set(rejected))[:100]},'activeServiceIds':services,'selectedStopDepartures':{'count':len(departures),'sample':departures[:12]},'realtime':realtime_probe(stop,set(trip_by_id))}
    with open(output,'w') as f: json.dump(report,f,indent=2,sort_keys=True)
    print(json.dumps({'output':output,'counts':report['counts'],'activeServiceIds':len(services),'selectedStopDepartures':len(departures),'realtime':report['realtime']},indent=2))
if __name__=='__main__': main()
