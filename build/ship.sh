#!/bin/sh
# Build, verify, then commit this folder to the site repo on a new branch
# "redesign" (as site/build/). Stops at the first failure. Does not push.
#
#   sh ship.sh
set -eu
cd "$(dirname "$0")"
SITE=../site

node build.mjs
node verify/check-data.mjs
python3 verify/check-pages.py

git -C "$SITE" switch -c redesign
mkdir -p "$SITE/build"
cp -R README.md build.mjs ship.sh src verify dist "$SITE/build/"
git -C "$SITE" add build
git -C "$SITE" commit -m "Add Direction A static build (build/, dist/)

One dependency-free Node script (build/build.mjs) turns plays.json into the
redesigned static site in build/dist: home with count-ups, equity curve, the
filtered play log and per-sport splits; About and How to read; the seven
calculators plus the cheat sheet. No external requests. Verification scripts
in build/verify.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git -C "$SITE" log --oneline -1
