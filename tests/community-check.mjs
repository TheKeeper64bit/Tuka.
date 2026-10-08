import assert from 'node:assert/strict';import {PassengerReports,expiredArrival} from '../dist/community.js';
const a={trip:{trip_id:'24-t'},day:{date:'20261008'},s:{seq:4},time:100000,route:{route_short_name:'24'}};
assert.equal(expiredArrival([a],[],110000),a);assert.equal(expiredArrival([a],[{...a,time:200000}],110000),undefined);assert.equal(expiredArrival([{...a,unmatched:true}],[],110000),undefined);
const reports=new PassengerReports();reports.config={enabled:true,url:'test',publishableKey:'public'};reports.watch('rekord');assert.equal(reports.tick([a],true,90000),null);assert(reports.tick([],true,110000));assert.equal(reports.tick([],true,131000),null);reports.watch('other');assert.equal(reports.previous.length,0);assert.equal(reports.tick([],true,132000),null);
const far=new PassengerReports();far.config=reports.config;far.watch('rekord');far.tick([a],false,90000);assert.equal(far.tick([],false,110000),null);
console.log('Passed: optional prompt on observed disappearance, expiry, revised ETA, unmatched trips, stop changes and nearby gating');
