#!/usr/bin/env python3
"""Real isolated GUI tasks; GUI alone creates documents. No input replay."""
import argparse
import asyncio
import hashlib
import io
import json
import os
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from PIL import Image  # noqa: E402

from src.computer.controller import ComputerController  # noqa: E402
from src.computer.models import RequestContext  # noqa: E402
from src.computer.runtime.backend import LinuxDesktopBackend  # noqa: E402
from src.computer.store import ComputerStore  # noqa: E402
from src.computer.vision import observation_image  # noqa: E402


class EvidenceBackend(LinuxDesktopBackend):
    """Record native errors without changing admission, behavior, or receipts."""
    async def act(self, action):
        try:
            result = await super().act(action)
            self.evidence_record('native_receipt', result=result)
            return result
        except Exception as exc:
            self.evidence_record('native_error', error=repr(exc))
            raise

    async def observe(self):
        try:
            return await super().observe()
        except Exception as exc:
            self.evidence_record('native_observe_error', error=repr(exc))
            raise


class Corpus:
    def __init__(self, args):
        self.args = args
        self.out = Path(args.evidence).resolve()
        self.out.mkdir(parents=True, mode=0o700, exist_ok=False)
        os.umask(0o077)
        self.backend = EvidenceBackend(enabled=True, app_profile=args.app, runtime_sudo=True)
        self.backend.evidence_record = self.record
        self.store = ComputerStore(self.out / 'db', self.out / 'evidence')
        self.ctx = RequestContext('corpus-r5', 'fixture', 'task-corpus', 'localhost')
        self.operator = RequestContext('corpus-r5', 'operator', 'operator-stop', 'localhost',
                                       surface='webui')
        self.controller = ComputerController(self.store, lambda _: self.backend,
            lambda ctx: ctx in (self.ctx, self.operator), enabled=True)
        self.sid = None
        self.task = None
        self.ledger = []

    def record(self, event, **data):
        entry = dict(event=event, monotonic=time.monotonic(), **data)
        entry.setdefault('task', self.task)
        with (self.out / 'events.jsonl').open('a') as f:
            f.write(json.dumps(entry, sort_keys=True) + '\n')
        if event != 'observe':
            print(json.dumps(entry, sort_keys=True), flush=True)

    async def bounded(self, awaitable, seconds=15):
        return await asyncio.wait_for(awaitable, seconds)

    def grant(self):
        return self.store.get_session(self.sid)

    async def observe(self):
        g = self.grant()
        result = await self.bounded(self.controller.observe(self.ctx,
            dict(session_id=self.sid, generation=g.generation)))
        obs = self.controller._live[self.sid].observations[result['observation_id']]
        assert observation_image(result['image_bytes'], obs.frame_metadata)['__computer_frame__']
        await self.bounded(self.controller.validate_observation_delivery(self.ctx,
            obs.frame_metadata, obs.image_sha256))
        (self.out / 'current.png').write_bytes(result['image_bytes'])
        (self.out / 'current-nodes.json').write_text(json.dumps(obs.accessibility, indent=2))
        self.record('observe', observation=obs.public(), nodes=obs.accessibility)
        return obs

    async def act(self, operation, **fields):
        obs = await self.observe()
        deadline = time.monotonic() + 8
        while True:
            await asyncio.sleep(.35)
            fresh = await self.observe()
            if fresh.image_sha256 == obs.image_sha256:
                obs = fresh
                break
            obs = fresh
            if time.monotonic() >= deadline:
                raise AssertionError('pre-input pixels never settled; no input sent')
        payload = dict(session_id=self.sid, generation=obs.generation,
            consent_generation=obs.source.consent_generation, source_id=obs.source.source_id,
            source_revision=obs.source.source_revision, action_id=uuid.uuid4().hex,
            observation_id=obs.observation_id, operation=operation,
            expect={'type': 'visual_change'}, **fields)
        if obs.modal:
            assert obs.modal_kind == 'safe_application', 'unsafe modal'
            payload['expected_modal'] = obs.modal
        started = time.monotonic()
        result = await self.bounded(self.controller.act(self.ctx, payload))
        self.record('act', payload=payload, result=result, seconds=time.monotonic()-started)
        # An already selected field or end-of-buffer key may have no raster change.
        # Semantic success is decided only by independent task-level readback.
        assert result['status'] in ('verified', 'executed', 'not_satisfied'), result
        assert result.get('execution', {}).get('released') is True, result
        await asyncio.sleep(.2)
        return result

    async def key(self, key):
        return await self.act('key', key=key)

    async def text(self, text):
        return await self.act('type', text=text)

    async def modal(self, present):
        deadline = time.monotonic() + 8
        while True:
            obs = await self.observe()
            if bool(obs.modal) == present:
                return obs
            if time.monotonic() > deadline:
                raise AssertionError('modal state did not settle')
            await asyncio.sleep(.25)

    async def save_as(self, name):
        await self.key('ctrl+s')
        await self.modal(True)
        await self.key('ctrl+a')
        await self.text('/workspace/exports/' + name)
        await self.key('Return')
        await self.modal(False)

    async def click_named(self, name):
        obs = await self.observe()
        matches = [n for n in obs.accessibility if n.get('name') == name
            and 0 <= n.get('bounds', {}).get('x', -1) < obs.width
            and 0 <= n.get('bounds', {}).get('y', -1) < obs.height]
        assert len(matches) == 1, (name, len(matches))
        b = matches[0]['bounds']
        await self.act('click', x=b['x']+b['width']//2, y=b['y']+b['height']//2)

    async def open_save_as(self):
        await self.click_named('File')
        await self.click_named('Save As...')

    async def reopen(self, name):
        await self.key('ctrl+o')
        obs = await self.observe()
        assert any(n.get('role') == 'file chooser' and n.get('name') in
            ('Open Files', 'Open a picture') for n in obs.accessibility)
        await self.text('/workspace/exports/' + name)
        await self.click_named('Open')
        await self.modal(False)

    async def export(self, name, expected=None):
        deadline = time.monotonic() + 10
        while True:
            try:
                g = self.grant()
                result = await self.bounded(self.controller.session(self.ctx,
                    dict(operation='export', session_id=self.sid,
                         generation=g.generation, name=name)))
                blob, metadata = self.store.read_evidence(self.ctx, result['artifact_id'])
                if expected is not None and blob != expected:
                    raise AssertionError('readback not yet expected bytes')
                (self.out / name).write_bytes(blob)
                self.record('export', name=name, bytes=len(blob),
                            sha256=hashlib.sha256(blob).hexdigest(), metadata=metadata)
                return blob
            except Exception as exc:
                self.record('export_wait', name=name, error=str(exc))
                if time.monotonic() >= deadline:
                    raise
                await asyncio.sleep(.3)

    async def pause_resume(self):
        before = self.grant().generation
        started = time.monotonic()
        result = await self.bounded(self.controller.operator_session(self.operator, 'pause'))
        self.record('operator_pause', result=result, seconds=time.monotonic()-started)
        assert result['state'] == 'paused' and result['generation'] > before
        try:
            await self.observe()
        except Exception as exc:
            self.record('paused_observe_denied', error=str(exc))
        else:
            raise AssertionError('paused model observation accepted')
        result = await self.bounded(self.controller.session(self.ctx, dict(operation='resume',
            session_id=self.sid, generation=self.grant().generation)))
        self.record('resume', result=result)
        assert result['state'] == 'active' and result['generation'] > before

    async def note(self, number):
        variant = (number - 1) % 10
        base = f'Field note {number:02d}\nStation: North\nReading: {number * 17}\n'
        if number != self.args.start:
            await self.key('ctrl+n')
        await self.text(base)
        expected = base
        if variant == 1:
            expected = base.replace('North', 'South') + 'Correction verified.\n'
            await self.key('ctrl+a')
            await self.text(expected)
        elif variant == 2:
            await self.key('ctrl+a')
            await self.text('temporary replacement')
            await self.key('ctrl+z')
        elif variant == 3:
            expected += 'Follow-up: stable\n'
            await self.key('ctrl+End')
            await self.text('Follow-up: stable\n')
        elif variant == 4:
            expected = 'CONFIRMED\n' + base
            await self.key('ctrl+Home')
            await self.text('CONFIRMED\n')
        elif variant == 5:
            await self.key('ctrl+f')
            await self.text('Station')
            await self.key('Escape')
        elif variant == 6:
            await self.pause_resume()
            await self.key('ctrl+End')
            await self.text('Resumed by owner.\n')
            expected += 'Resumed by owner.\n'
        elif variant == 7:
            await self.key('ctrl+s')
            await self.modal(True)
            await self.key('Escape')
            await self.modal(False)
        elif variant == 8:
            await self.key('ctrl+End')
            await self.text('Reviewed\n')
            await self.key('ctrl+z')
            await self.key('ctrl+y')
            expected += 'Reviewed\n'
        elif variant == 9:
            await self.key('ctrl+End')
            await self.key('BackSpace')
            expected = base[:-1]
        name = f'note-{number:02d}.txt'
        # Xed's default ensure-trailing-newline adds one serialization LF.
        expected += '\n'
        await self.save_as(name)
        await self.export(name, expected.encode())
        obs = await self.observe()
        tabs = [n for n in obs.accessibility if n.get('role') == 'page tab'
                and n.get('name') == name]
        assert len(tabs) == 1, 'saved tab not uniquely observed'
        b = tabs[0]['bounds']
        await self.act('click', x=b['x']+b['width']-17, y=b['y']+b['height']//2)
        await self.key('ctrl+n')
        await self.reopen(name)
        await self.key('ctrl+End')
        await self.text('Reopened and checked.')
        await self.key('ctrl+s')
        expected = expected[:-1] + 'Reopened and checked.\n'
        await self.export(name, expected.encode())
        return dict(variant=variant, artifact=name, reopened_edit=True, exact_utf8=expected)

    async def drawing(self, number):
        if number == self.args.start:
            obs = await self.observe()
            if obs.modal:
                assert obs.modal_kind == 'safe_application'
                await self.key('Return')
        else:
            await self.key('ctrl+n')
        offset = (number % 5) * 15
        paths = [[[310+offset, 300], [410+offset, 300], [410+offset, 390]],
                 [[320+offset, 410], [370+offset, 350], [420+offset, 410]],
                 [[320+offset, 440], [360+offset, 470], [420+offset, 430]]]
        for path in paths:
            await self.act('drag', points=path, duration=.25)
        if number % 3 == 0:
            await self.pause_resume()
        name = f'drawing-{number:02d}.png'
        await self.save_as(name)
        blob = await self.export(name)
        with Image.open(io.BytesIO(blob)) as im:
            im.load()
            assert im.size == (1000, 600), im.size
            pixels = im.convert('RGB').tobytes()
            ink = sum(1 for r, g, b in im.convert('RGB').getdata() if min(r, g, b) < 100)
            assert ink > 500, ink
        await self.key('ctrl+n')
        await self.reopen(name)
        await self.observe()
        with Image.open(self.out / 'current.png') as screen:
            screen = screen.convert('RGB')
            # Compare complete decoded canvas, not PNG encoding or screenshot hash.
            matched = False
            for x in range(281):
                for y in range(361):
                    if screen.crop((x, y, x+1000, y+1)).tobytes() == pixels[:3000]:
                        if screen.crop((x, y, x+1000, y+600)).tobytes() == pixels:
                            matched = True
                            break
                if matched:
                    break
            assert matched, 'reopened screenshot canvas not pixel-equal to export'
        return dict(artifact=name, ink_pixels=ink, reopen_pixels_equal=True)

    async def run(self):
        try:
            grant = await self.bounded(self.controller.session(self.ctx,
                dict(operation='start', app=self.args.app)), 30)
            self.sid = grant['session_id']
            self.record('started', grant=grant, unit=self.backend._unit,
                supervisor_pid=self.backend._process.pid, driver_pid=os.getpid())
            await self.observe()
            for number in range(self.args.start, self.args.start+self.args.count):
                self.task = f'{self.args.app}-{number:02d}'
                started = time.monotonic()
                try:
                    task = self.note(number) if self.args.app == 'xed' else self.drawing(number)
                    result = await self.bounded(task, 240)
                    row = dict(task=self.task, status='pass',
                               seconds=time.monotonic()-started, **result)
                except Exception as exc:
                    row = dict(task=self.task, status='fail', seconds=time.monotonic()-started,
                        error=type(exc).__name__ + ': ' + str(exc))
                    self.ledger.append(row)
                    self.record('task_result', **row)
                    for remaining in range(number+1, self.args.start+self.args.count):
                        self.ledger.append(dict(task=f'{self.args.app}-{remaining:02d}',
                            status='blocked', error='previous task failed; no blind replay'))
                    break
                self.ledger.append(row)
                self.record('task_result', **row)
                Path('/tmp/gui-corpus-r5-status.txt').write_text(json.dumps(dict(
                    evidence=str(self.out), ledger=self.ledger), indent=2))
        finally:
            if self.sid:
                started = time.monotonic()
                result = await self.bounded(
                    self.controller.operator_session(self.operator, 'cancel'), 20)
                self.record('operator_cancel', result=result, seconds=time.monotonic()-started)
            await self.bounded(self.controller.close(), 25)
            self.record('cleanup', unit=self.backend._unit,
                supervisor_returncode=(self.backend._process.returncode
                                       if self.backend._process else None))
            (self.out / 'ledger.json').write_text(json.dumps(self.ledger, indent=2))
            self.store.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--app', choices=('xed', 'drawing'), required=True)
    parser.add_argument('--evidence', required=True)
    parser.add_argument('--start', type=int, default=1)
    parser.add_argument('--count', type=int, default=1)
    asyncio.run(Corpus(parser.parse_args()).run())


if __name__ == '__main__':
    main()
