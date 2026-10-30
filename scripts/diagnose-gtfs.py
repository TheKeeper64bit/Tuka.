#!/usr/bin/env python3
"""Compatibility entry point; diagnostics now use the application's JS engine."""
import argparse
import datetime
import pathlib
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('feed')
parser.add_argument('output')
parser.add_argument('--city', choices=['boston', 'skopje'], default='boston')
parser.add_argument('--date', default=datetime.date.today().isoformat())
parser.add_argument('--stop', default='1')
args = parser.parse_args()
script = pathlib.Path(__file__).with_name('diagnose-transit.mjs')
subprocess.run(['node', str(script), args.city, args.feed, args.output, args.date, args.stop], check=True)
