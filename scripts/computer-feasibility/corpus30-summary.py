#!/usr/bin/env python3
"""Aggregate distinct tasks without counting retries as new successes."""
import hashlib
import json
from pathlib import Path

from PIL import Image


def main():
    roots = [Path('/home/odin/corpus30-xed-a'), Path('/home/odin/corpus30-xed-b'),
             Path('/home/odin/corpus30-xed-c'), Path('/home/odin/corpus30-xed-repeat')]
    roots += sorted(Path('/home/odin').glob('corpus30-drawing-batch-*'))
    attempts = {n: [] for n in range(1, 31)}
    for root in roots:
        ledger = root/'ledger.json'
        if not ledger.exists():
            continue
        for row in json.loads(ledger.read_text()):
            n = int(row['task'].split('-')[-1])
            attempts[n].append(dict(evidence=str(root), **row))
    tasks = []
    independent_drawings = []
    for n, rows in attempts.items():
        passed = [r for r in rows if r['status'] == 'pass']
        tasks.append(dict(id=n, status='pass' if passed else 'fail',
                          attempts=len(rows), passing_attempts=len(passed), records=rows))
        if n > 15 and passed:
            row = passed[-1]
            directory = Path(row['evidence'])/f'case-{n-15:02d}'
            with Image.open(directory/row['artifact']) as image:
                image.verify()
            with Image.open(directory/row['artifact']) as image:
                rgb = image.convert('RGB')
                assert rgb.size == (1000, 600)
                blob = rgb.tobytes()
            with Image.open(directory/'reopened.png') as screen:
                x, y = row['canvas_origin']
                assert screen.convert('RGB').crop((x, y, x+1000, y+600)).tobytes() == blob
            with Image.open(directory/'new-blank.png') as image:
                assert image.convert('RGB').crop((290, 280, 700, 560)).getextrema() == (
                    (255, 255), (255, 255), (255, 255))
            independent_drawings.append(dict(id=n, artifact=str(directory/row['artifact']),
                                             full_canvas_sha256=hashlib.sha256(blob).hexdigest()))
    count = sum(t['status'] == 'pass' for t in tasks)
    result = dict(planned_distinct=30, passed_distinct=count, failed_distinct=30-count,
                  gate_met=count >= 27, tasks=tasks,
                  independently_checked_drawing_canvases=independent_drawings)
    Path('/tmp/corpus30-r5-status.txt').write_text(json.dumps(result, indent=2))
    Path('/home/odin/corpus30-aggregate.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(dict(passed_distinct=count, denominator=30,
                          failed_ids=[t['id'] for t in tasks if t['status'] != 'pass'],
                          image_file_canvas_checks=len(independent_drawings))))


if __name__ == '__main__':
    main()
