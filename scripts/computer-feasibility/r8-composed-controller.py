"""Production composition in an owned Docker desktop, never the host GUI.

The real consent UI is pressed by a separate private operator simulator. Every
application edit uses WaylandRuntimeBackend, not AT-SPI or Mutter Notify. A blank
existing scratch document permits ordinary save without a refused file dialog.
"""
import asyncio
import hashlib
import json
import logging
import os
from pathlib import Path
import time
import traceback
import xml.etree.ElementTree as ET

from src.computer.runtime.wayland_backend import WaylandRuntimeBackend, WaylandSessionConfig
from src.computer.runtime.wayland_probe import GnomeSameStackQualifier

EVIDENCE = Path('/evidence')


def record(kind, **fields):
    row = {'kind': kind, 'at': time.monotonic(), **fields}
    with (EVIDENCE / 'composition.jsonl').open('a') as stream:
        stream.write(json.dumps(row, sort_keys=True) + '\n')
    print(json.dumps(row, sort_keys=True), flush=True)


async def operator():
    for role, name in [('check box', 'Allow Remote Interaction'), ('push button', 'Share')]:
        success = False
        for attempt in range(20):
            await asyncio.sleep(.5)
            child = await asyncio.create_subprocess_exec(
                '/usr/bin/python3', '/harness/wayland-r8-consent.py', role, name,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
            try:
                output, _ = await asyncio.wait_for(child.communicate(), 8)
            finally:
                if child.returncode is None:
                    child.terminate()
                    await child.wait()
            with (EVIDENCE / 'operator-consent.log').open('ab') as stream:
                stream.write(output)
            if child.returncode == 0:
                record('operator_control', name=name, attempt=attempt)
                success = True
                break
        if not success:
            raise RuntimeError('real_private_portal_consent_failed')


async def main():
    assert Path('/.dockerenv').exists() and os.environ['HOME'] == '/tmp/home'
    assert os.getuid() == 1003 and not os.environ.get('DISPLAY')
    logging.basicConfig(level=logging.DEBUG)

    async def probe_spawn(pid):
        record('probe_spawn', pid=pid)

    address = os.environ['DBUS_SESSION_BUS_ADDRESS'].split(',guid=', 1)[0]
    backend = WaylandRuntimeBackend(enabled=True, app_profile='inkscape',
        config=WaylandSessionConfig(address, os.getuid(), '/usr/local/bin/wayland-owned-input'),
        qualify=GnomeSameStackQualifier(record_spawn=probe_spawn))
    backend.runtime_identity_callback = lambda identity: record('runtime_identity', identity=identity)
    consent = asyncio.create_task(operator())
    task_ok = False
    try:
        started = await backend.start('a' * 32)
        record('started', result=started)
        await consent
        if not started['input_supported']:
            raise RuntimeError('production_input_refused:' + str(started['input_blocker']))
        await asyncio.sleep(3)

        async def observe(label):
            frame = await backend.observe()
            (EVIDENCE / f'{label}.png').write_bytes(frame.image_bytes)
            record('observation', label=label, focused=frame.focused,
                   source_id=frame.source.source_id, source_revision=frame.source.source_revision,
                   consent_generation=frame.source.consent_generation,
                   width=frame.width, height=frame.height,
                   sha256=hashlib.sha256(frame.image_bytes).hexdigest())
            return frame

        async def action(label, kind, **fields):
            frame = await observe(label + '-before')
            if not frame.focused:
                metadata = backend._sources[backend._selected]
                try:
                    scope = await backend._scope_provider.snapshot(metadata, 'inkscape')
                    record('scope_diagnostic', scope=scope)
                except Exception as error:
                    record('scope_diagnostic', error=str(error))
                raise RuntimeError('production_authenticated_focus_unavailable')
            payload = dict(type=kind, source_id=frame.source.source_id,
                source_revision=frame.source.source_revision,
                consent_generation=frame.source.consent_generation,
                expected={'type': 'visual_change'}, **fields)
            result = await backend.act(payload)
            record('action', label=label, payload=payload, result=result)
            await asyncio.sleep(.3)
            return result

        # Printable r selects rectangle; normal canvas drag creates a shape.
        # Ctrl+S exercises the newest production native J chord implementation.
        await action('rectangle-tool', 'type', text='r')
        await action('rectangle', 'polyline', points=[[420, 340], [520, 340], [520, 450]], duration=.3)
        await action('deselect', 'key', chord='Escape')
        await action('save', 'key', chord='ctrl+s')
        await asyncio.sleep(1)
        await observe('after-save')
        data = Path('/tmp/work/r8-composed-scratch.svg').read_bytes()
        root = ET.fromstring(data)
        shapes = [node for node in root.iter() if node.tag.rsplit('}', 1)[-1]
                  in {'rect', 'path', 'ellipse', 'circle', 'polygon'}]
        record('saved_artifact', size=len(data), sha256=hashlib.sha256(data).hexdigest(),
               shape_count=len(shapes))
        if not shapes:
            raise RuntimeError('saved_svg_has_no_gui_created_shapes')
        (EVIDENCE / 'r8-composed-scratch.svg').write_bytes(data)
        task_ok = True
    except BaseException as error:
        record('failure', error=str(error), traceback=traceback.format_exc())
        raise
    finally:
        if not consent.done():
            consent.cancel()
        await asyncio.gather(consent, return_exceptions=True)
        stopped = await backend.stop()
        record('stopped', result=stopped, task_ok=task_ok)
        if not stopped['stopped']:
            raise RuntimeError('production_backend_cleanup_unverified')


if __name__ == '__main__':
    asyncio.run(main())
