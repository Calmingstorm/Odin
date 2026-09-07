#!/usr/bin/env python3
"""Distinct native Drawing acceptance tasks, one isolated fixture per attempt."""

import argparse
import asyncio
import hashlib
import importlib.util
import io
import json
import os
import subprocess
import time
from pathlib import Path
from types import SimpleNamespace

HELPER = Path(__file__).with_name('gui-task-corpus.py')
spec = importlib.util.spec_from_file_location('drawing_corpus_helper', HELPER)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
Image = helper.Image

PLANS = ['Pencil connected zigzag', 'Straight diagonal line', 'Rectangle outline',
    'Oval outline', 'Rounded rectangle', 'Closed triangle polygon',
    'Main-color filled rectangle', 'Horizontal gradient rectangle',
    'Eraser correction gap', 'Translucent highlighter band', 'CORPUS text insertion',
    'Undo separate second line', 'Redo separate second line',
    'Rectangular selection move', 'Dashed horizontal line']


def semantic_check(blob, case):
    """Predetermined geometry/color predicates, independent of current UI raster."""
    with Image.open(io.BytesIO(blob)) as image:
        image.load()
        assert image.size == (1000, 600), image.size
        im = image.convert('RGB')
    def region(x, y, r=5):
        return list(im.crop((x-40-r, y-47-r, x-40+r+1, y-47+r+1)).getdata())
    def red(x, y):
        assert any(r > 180 and g < 100 and b < 100 for r,g,b in region(x,y)), (x,y,'not red')
    def white(x, y):
        assert all(min(p) > 245 for p in region(x,y)), (x,y,'not white')
    white(700,550)
    if case == 1:
        for p in [(350,300),(400,335),(440,370)]:
            red(*p)
        white(330,390)
    elif case == 2:
        for p in [(325,318),(400,370),(475,422)]:
            red(*p)
        white(330,400)
    elif case in (3,4,5,6,7,8):
        if case in (3,5):
            for p in [(400,300),(300,370),(500,370),(400,440)]:
                red(*p)
            white(400,370)
            if case == 3:
                red(300,300)
                red(500,440)
            if case == 5:
                assert all(min(p)>245 for p in region(300,300,r=1)), 'rounded corner is filled'
        elif case == 4:
            for p in [(400,300),(300,370),(500,370),(400,440)]:
                red(*p)
            for p in [(400,370),(305,305),(495,435)]:
                white(*p)
        elif case == 6:
            for p in [(350,370),(450,370),(400,440)]:
                red(*p)
            white(400,390)
            white(310,315)
        elif case == 7:
            for p in [(320,320),(400,370),(480,420)]:
                red(*p)
            assert sum(1 for r,g,b in im.getdata() if r>180 and g<100 and b<100)>25000
        elif case == 8:
            a=im.getpixel((320-40,370-47))
            b=im.getpixel((480-40,370-47))
            assert (
                a[0]>150 and a[1]<100 and b[1]>120
                and sum(abs(a[i]-b[i]) for i in range(3))>180
            ),(a,b)
    elif case == 9:
        red(320,350)
        red(480,350)
        white(400,350)
    elif case == 10:
        colored=[p for p in region(400,350) if p[0]>180 and 60<p[1]<230 and 60<p[2]<230]
        assert len(colored)>20, 'no translucent highlight'
    elif case == 11:
        assert sum(1 for p in im.crop((240,210,600,400)).getdata() if min(p)<150)>100
    elif case in (12,13):
        red(400,300)
        if case == 12:
            white(400,420)
        else:
            red(400,420)
    elif case == 14:
        white(350,300)
        red(550,440)
    elif case == 15:
        values=[im.getpixel((x-40,350-47))[1]<100 for x in range(310,490)]
        assert 30<sum(values)<160 and sum(a!=b for a,b in zip(values,values[1:]))>=8, 'not dashed'
    return dict(decoded_rgb_sha256=hashlib.sha256(im.tobytes()).hexdigest(),
        semantic_predicate=PLANS[case-1], semantic_pass=True), im


class DrawingCorpus(helper.Corpus):
    def ocr(self, path):
        text = subprocess.run(['tesseract',str(path),'stdout','tsv'], capture_output=True,
            text=True, timeout=15, check=True).stdout
        words=[]
        for line in text.splitlines()[1:]:
            p=line.split('\t')
            if len(p)==12 and p[11].strip():
                words.append(dict(text=p[11], x=int(p[6]), y=int(p[7]), w=int(p[8]), h=int(p[9])))
        return words

    async def click_label(self, label):
        await self.snapshot('label-'+label.replace(' ','-'))
        words=self.ocr(self.out/'current.png')
        tokens=label.split()
        matches=[]
        for i in range(len(words)-len(tokens)+1):
            chunk=words[i:i+len(tokens)]
            if [w['text'] for w in chunk]==tokens:
                matches.append(chunk)
        assert len(matches)==1, (label,words)
        chunk=matches[0]
        self.record('pixel_label', label=label, words=chunk)
        await self.act('click',x=chunk[0]['x']+5,y=chunk[0]['y']+chunk[0]['h']//2)

    async def tool(self, name):
        ys={'pencil':78,'eraser':140,'highlight':202,'text':264,
            'selection':326,'free_selection':388,'line':450,'arc':512,'shape':574}
        await self.act('click', x=20,y=ys[name])
        await self.snapshot('tool-'+name)

    async def drag(self, *points):
        await self.act('drag', points=[list(p) for p in points], duration=.35)

    async def options(self):
        await self.act('click',x=310,y=937)

    async def shape(self, kind, fill=None):
        await self.tool('shape')
        await self.options()
        await self.snapshot('shape-options')
        xs={'rectangle':225,'rounded':263,'oval':301,'polygon':339,'free':377,'circle':415}
        await self.act('click',x=xs[kind],y=820)
        # Selecting an already-active polygon does not dismiss its popover.
        if kind=='polygon':
            await self.key('Escape')
        if fill:
            await self.options()
            await self.click_label(fill)

    async def size(self, value):
        # GTK spin field is non-editable in this profile. Its observed + is native.
        current=getattr(self,'tool_size',5)
        for _ in range(abs(value-current)):
            await self.act('click',x=230 if value>current else 195,y=937)
        self.tool_size=value
        await self.snapshot('size-set')

    async def task_actions(self, case):
        if case == 1:
            await self.drag((300,300),(400,300),(400,370),(480,370))
        elif case == 2:
            await self.tool('line')
            await self.drag((300,300),(500,440))
        elif case in (3,4,5,6,7,8):
            kind={3:'rectangle',4:'oval',5:'rounded',6:'polygon',7:'rectangle',8:'rectangle'}[case]
            await self.shape(kind, {7:'Main color',8:'Horizontal gradient'}.get(case))
            if case == 6:
                await self.drag((400,300),(300,440))
                await self.drag((300,440),(500,440))
                await self.drag((500,440),(400,300))
            else:
                await self.drag((300,300),(500,440))
        elif case == 9:
            await self.tool('line')
            await self.drag((300,350),(500,350))
            await self.tool('eraser')
            await self.size(15)
            await self.options()
            await self.click_label('Default color')
            await self.drag((400,320),(400,380))
        elif case == 10:
            await self.tool('highlight')
            await self.size(15)
            await self.drag((300,350),(500,350))
        elif case == 11:
            await self.tool('text')
            await self.size(20)
            await self.act('click',x=300,y=300)
            await self.text('CORPUS')
            await self.click_label('Insert here')
        elif case in (12,13):
            await self.tool('line')
            await self.drag((300,300),(500,300))
            await self.drag((300,420),(500,420))
            await self.key('ctrl+z')
            if case == 13:
                # Drawing advertises Ctrl+Shift+Z, not Ctrl+Y. Native header Redo.
                await self.act('click',x=191,y=22)
        elif case == 14:
            await self.drag((300,300),(400,300),(400,340))
            await self.tool('selection')
            await self.act('click',x=380,y=937)
            await self.click_label('Default color')
            await self.drag((280,280),(420,360))
            await self.drag((350,320),(550,460))
            await self.tool('pencil')
        elif case == 15:
            await self.tool('line')
            await self.options()
            await self.snapshot('line-options')
            # Native screenshot discovery establishes this menu's dash row.
            await self.act('click',x=270,y=752)
            await self.drag((300,350),(500,350))

    async def verify_reopen(self, name, image):
        pixels=image.tobytes()
        await self.act('click',x=95,y=22)
        await self.act('click',x=77,y=83)
        await self.snapshot('new-blank')
        assert self.backend.last_native_observation['window']['title']=='Unsaved file'
        with Image.open(self.out/'new-blank.png') as blank:
            assert all(min(p)>245 for p in blank.convert('RGB').crop((290,280,700,560)).getdata())
        self.record('new_blank_created', title='Unsaved file', ink_roi_empty=True)
        await self.act('click',x=615,y=65)
        await self.snapshot('closed-saved-tab')
        assert self.backend.last_native_observation['window']['title']=='Unsaved file'
        closed_words=' '.join(w['text'] for w in self.ocr(self.out/'closed-saved-tab.png'))
        assert name not in closed_words, closed_words
        self.record('saved_tab_closed',
            native_window=self.backend.last_native_observation['window'])
        await self.reopen(name)
        await self.snapshot('reopened')
        with Image.open(self.out/'reopened.png') as screen:
            screen=screen.convert('RGB')
            found=None
            for x in range(281):
                for y in range(361):
                    if (
                        screen.crop((x,y,x+1000,y+1)).tobytes()==pixels[:3000]
                        and screen.crop((x,y,x+1000,y+600)).tobytes()==pixels
                    ):
                        found=[x,y]
                        break
                if found:
                    break
            assert found, 'complete reopened canvas differs from decoded PNG'
        return dict(saved_tab_closed=True,blank_intermediate=True,
            reopen_pixels_equal=True,canvas_origin=found)

    async def snapshot(self, label):
        obs = await self.observe()
        (self.out / (label + '.png')).write_bytes((self.out / 'current.png').read_bytes())
        (self.out / (label + '-nodes.json')).write_text(json.dumps(obs.accessibility, indent=2))
        return obs

    async def startup(self):
        grant = await self.bounded(self.controller.session(self.ctx,
            dict(operation='start', app='drawing')), 30)
        self.sid = grant['session_id']
        self.record('started', grant=grant, unit=self.backend._unit,
            supervisor_pid=self.backend._process.pid, driver_pid=os.getpid())
        obs = await self.observe()
        if obs.modal:
            assert obs.modal_kind == 'safe_application'
            await self.key('Return')
        await self.snapshot('startup')

    async def execute(self, case):
        self.task = f'drawing-{case+15:02d}'
        started = time.monotonic()
        try:
            await self.startup()
            if self.args.probe:
                for x, y in self.args.probe:
                    await self.act('click', x=x, y=y)
                    await self.snapshot(f'probe-{x}-{y}')
                row = dict(task=self.task, status='probe', seconds=time.monotonic()-started)
            else:
                self.record('planned_success', case=case, workflow=PLANS[case-1],
                    predicate=(
                        'semantic_check predefined geometry/color plus full disk reopen equality'))
                await self.task_actions(case)
                await self.snapshot('authored-before-commit')
                await self.tool('pencil')
                name=f'drawing-{case+15:02d}.png'
                await self.save_as(name)
                blob=await self.export(name)
                details,image=semantic_check(blob,case)
                if case==11:
                    words=' '.join(w['text'] for w in self.ocr(self.out/name))
                    assert 'CORPUS' in words,words
                    details['ocr_text']=words
                self.record('semantic_verification', **details)
                details.update(await self.verify_reopen(name,image))
                row=dict(task=self.task,status='pass',artifact=name,
                    seconds=time.monotonic()-started,**details)
        except Exception as exc:
            row = dict(task=self.task, status='fail', error=repr(exc),
                seconds=time.monotonic()-started)
        finally:
            if self.sid:
                result = await self.bounded(
                    self.controller.operator_session(self.operator, 'cancel'), 20)
                self.record('operator_cancel', result=result)
            await self.bounded(self.controller.close(), 25)
            self.record('cleanup', unit=self.backend._unit,
                supervisor_returncode=(
                    self.backend._process.returncode if self.backend._process else None))
            self.store.close()
        self.record('task_result', **row)
        (self.out / 'ledger.json').write_text(json.dumps([row], indent=2))
        return row


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', required=True)
    parser.add_argument('--cases', default='1,2,3,4,5,6,7,8,9,10,11,12,13,14,15')
    parser.add_argument('--probe', help='discovery click coordinates x:y,x:y')
    args = parser.parse_args()
    root = Path(args.evidence).resolve()
    root.mkdir(mode=0o700, exist_ok=False)
    rows = []
    for case in map(int, args.cases.split(',')):
        assert 1 <= case <= 15
        fixture_args = SimpleNamespace(evidence=str(root / f'case-{case:02d}'), app='drawing',
            start=case, count=1,
            probe=[tuple(map(int, p.split(':'))) for p in args.probe.split(',')]
            if args.probe else None)
        fixture = DrawingCorpus(fixture_args)
        row = await asyncio.wait_for(fixture.execute(case), 300)
        rows.append(row)
        (root / 'ledger.json').write_text(json.dumps(rows, indent=2))
        Path('/tmp/corpus30-drawing-status.txt').write_text(
            json.dumps(dict(evidence=str(root), ledger=rows), indent=2))
    return int(any(row['status'] == 'fail' for row in rows))


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
