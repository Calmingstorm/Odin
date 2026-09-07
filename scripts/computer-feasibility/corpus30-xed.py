#!/usr/bin/env python3
"""Predeclared independent Xed workflows; fresh native sandbox for every case."""
import argparse
import asyncio
import importlib.util
import json
import time
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    'gui_corpus', Path(__file__).with_name('gui-task-corpus.py'))
HELPER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HELPER)

BASE = 'North station\nPressure stable\nEnd'
PLANS = {
    1: ('paragraphs', 'First paragraph.\nTwo observations.\n\nSecond paragraph.\nComplete.'),
    2: ('unicode_tab_fields', 'Name\tReading\nCafé\t23°C\nΔelta\tnaïve'),
    3: ('append_conclusion', BASE + '\nConclusion: safe'),
    4: ('prepend_title', 'REPORT\n' + BASE),
    5: ('replace_document', 'South station\nPressure corrected\nApproved'),
    6: ('replace_first_line', 'South station\nPressure stable\nEnd'),
    7: ('delete_selected_suffix', 'North station\nPressure stable\n'),
    8: ('replace_middle_line', 'North station\nPressure falling\nEnd'),
    9: ('save_as_rename', BASE),
    10: ('undo_append', BASE),
    11: ('redo_append', BASE + ' VERIFIED'),
    12: ('find_cancel', BASE),
    13: ('save_cancel', BASE),
    14: ('split_line', 'Nor\nth station\nPressure stable\nEnd'),
    15: ('join_lines', 'North stationPressure stable\nEnd'),
}


class XedCorpus(HELPER.Corpus):
    async def export(self, name, expected=None):
        # Preserve mismatched GUI exports, rather than losing the failed bytes.
        deadline = time.monotonic()+10
        while True:
            blob = await super().export(name)
            if expected is None or blob == expected:
                return blob
            self.record('exact_mismatch', name=name, expected=expected.decode(),
                        actual=blob.decode(errors='replace'))
            if time.monotonic() >= deadline:
                raise AssertionError('GUI artifact differs from predeclared UTF-8')
            await asyncio.sleep(.3)

    def record(self, event, **data):
        entry = dict(event=event, monotonic=time.monotonic(), **data)
        entry.setdefault('task', self.task)
        with (self.out / 'events.jsonl').open('a') as f:
            f.write(json.dumps(entry, sort_keys=True) + '\n')
        if event in ('started', 'task_result', 'cleanup', 'saved_tab_closed'):
            print(json.dumps(entry, sort_keys=True), flush=True)

    async def select_first(self):
        await self.key('ctrl+Home')
        await self.key('shift+Down')

    async def note(self, number):
        title, expected = PLANS[number]
        (self.out / 'predeclared.json').write_text(json.dumps(dict(
            case=number, title=title, initial_saved_utf8=expected+'\n',
            final_saved_utf8=expected+f' [reopened-{number:02d}]\n'), indent=2))
        await self.text(expected if number in (1, 2) else BASE)
        if number == 3:
            await self.key('ctrl+End')
            await self.text('\nConclusion: safe')
        elif number == 4:
            await self.key('ctrl+Home')
            await self.text('REPORT\n')
        elif number == 5:
            await self.key('ctrl+a')
            await self.text(expected)
        elif number == 6:
            await self.select_first()
            await self.text('South station\n')
        elif number == 7:
            await self.key('ctrl+End')
            for _ in range(3):
                await self.key('shift+Left')
            await self.key('Delete')
        elif number == 8:
            await self.key('ctrl+Home')
            await self.key('Down')
            await self.key('Home')
            await self.key('shift+Down')
            await self.text('Pressure falling\n')
        elif number in (10, 11):
            await self.key('ctrl+End')
            await self.text(' VERIFIED')
            await self.key('ctrl+z')
            if number == 11:
                await self.key('ctrl+y')
        elif number == 12:
            await self.key('ctrl+f')
            await self.text('Pressure')
            await self.key('Escape')
        elif number == 13:
            await self.key('ctrl+s')
            await self.modal(True)
            await self.key('Escape')
            await self.modal(False)
        elif number == 14:
            await self.key('ctrl+Home')
            for _ in range(3):
                await self.key('Right')
            await self.key('Return')
        elif number == 15:
            await self.key('ctrl+Home')
            await self.key('Down')
            await self.key('Home')
            await self.key('BackSpace')
        name = f'case-{number:02d}.txt'
        await self.save_as(name)
        await self.export(name, (expected+'\n').encode())
        if number == 9:
            await self.key('ctrl+shift+s')
            await self.modal(True)
            await self.key('ctrl+a')
            name = 'copy-09.txt'
            await self.text('/workspace/exports/'+name)
            await self.key('Return')
            await self.modal(False)
            await self.export(name, (expected+'\n').encode())
        await self.observe()
        assert name in self.backend.last_native_observation['window']['title']
        # Native screenshot crop case01 establishes single short-filename tab close
        # at x113..121,y98..105. AT-SPI omits Xed's entire notebook subtree.
        # Case names all have identical width, except copy09 differs by <=2px.
        await self.act('click', x=117, y=102)
        await self.observe()
        assert name not in self.backend.last_native_observation['window']['title'], (
            'saved tab still active')
        (self.out/'closed-tab.png').write_bytes((self.out/'current.png').read_bytes())
        self.record('saved_tab_closed', artifact=name, saved_tab_absent=True)
        await self.key('ctrl+n')
        await self.observe()
        (self.out/'blank.png').write_bytes((self.out/'current.png').read_bytes())
        await self.reopen(name)
        await self.observe()
        (self.out/'reopened.png').write_bytes((self.out/'current.png').read_bytes())
        await self.key('ctrl+End')
        await self.text(f' [reopened-{number:02d}]')
        await self.key('ctrl+s')
        await self.export(name, (expected+f' [reopened-{number:02d}]\n').encode())
        return dict(variant=title, artifact=name, saved_tab_closed=True,
                    disk_reopen_edit_exact=True, exact_utf8=expected+f' [reopened-{number:02d}]\n')


async def main(args):
    root = Path(args.evidence)
    root.mkdir(mode=0o700, exist_ok=False)
    ledger = []
    (root/'plans.json').write_text(json.dumps(PLANS, indent=2))
    for number in map(int, args.cases.split(',')):
        run = XedCorpus(argparse.Namespace(app='xed', evidence=str(root/f'case-{number:02d}'),
                                          start=number, count=1))
        try:
            await run.run()
        except Exception as exc:
            run.record('runner_error', error=repr(exc))
            if not run.ledger:
                run.ledger.append(dict(task=f'xed-{number:02d}', status='fail', error=repr(exc)))
        ledger.extend(run.ledger)
        (root/'ledger.json').write_text(json.dumps(ledger, indent=2))
        Path('/tmp/corpus30-r5-status.txt').write_text(json.dumps(dict(
            evidence=str(root), planned=30, xed_ledger=ledger,
            drawing_progress='/tmp/corpus30-drawing-status.txt'), indent=2))
    print(json.dumps(dict(event='batch_result', passed=sum(x['status']=='pass' for x in ledger),
                          attempted=len(ledger), evidence=str(root))), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', required=True)
    parser.add_argument('--cases', default=','.join(map(str, range(1, 16))))
    asyncio.run(main(parser.parse_args()))
