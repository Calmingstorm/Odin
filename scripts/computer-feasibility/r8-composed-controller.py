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
import time
import traceback
import xml.etree.ElementTree as ET
from pathlib import Path

from src.computer.runtime.wayland_backend import WaylandRuntimeBackend, WaylandSessionConfig
from src.computer.runtime.wayland_probe import GnomeSameStackQualifier

from src.computer.controller import ComputerController
from src.computer.models import RequestContext
from src.computer.store import ComputerStore

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
    backend.runtime_identity_callback = lambda identity: record(
        'runtime_identity', identity=identity)
    context = RequestContext('private-owner', 'private-channel', 'private-turn', 'private-host')
    store = ComputerStore('/tmp/work/composition.sqlite3', '/tmp/work/frames')
    controller = ComputerController(store, lambda _app: backend,
                                    lambda requested: requested == context, enabled=True)
    grant = None
    application_pid = int((EVIDENCE / 'inkscape.pid').read_text())
    application_stat = Path(f'/proc/{application_pid}/stat')
    application_start = application_stat.read_text().rsplit(')', 1)[1].split()[19]
    consent = asyncio.create_task(operator())
    task_ok = False
    try:
        started = await controller.session(context, {'operation': 'start', 'app': 'inkscape'})
        grant = {'session_id': started['session_id'], 'generation': started['generation']}
        record('started', result=started, entrypoint='ComputerController.session',
               authorization='private_fixture_context_only')
        await consent
        if not started['input_supported']:
            try:
                frame = await backend.observe()
                (EVIDENCE / 'refused-capture.png').write_bytes(frame.image_bytes)
                record('refused_capture', width=frame.width, height=frame.height,
                       focused=frame.focused)
            except Exception as capture_error:
                record('refused_capture_error', error=str(capture_error))
            raise RuntimeError('production_input_refused:' + started['input_admission']['code'])
        await asyncio.sleep(3)

        async def observe(label):
            observed = await controller.observe(context, grant)
            frame = controller._live[grant['session_id']].observations[observed['observation_id']]
            image = observed['image_bytes']
            (EVIDENCE / f'{label}.png').write_bytes(image)
            await controller.validate_observation_delivery(
                context, frame.frame_metadata, hashlib.sha256(image).hexdigest())
            record('observation', label=label, focused=frame.focused,
                   source_id=frame.source.source_id, source_revision=frame.source.source_revision,
                   consent_generation=frame.source.consent_generation,
                   width=frame.width, height=frame.height,
                   sha256=hashlib.sha256(image).hexdigest(),
                   delivery='actual_delivery_gate_fixture_renderer_not_model')
            return frame

        async def action(label, kind, **fields):
            frame = await observe(label + '-before')
            if not frame.focused:
                captured = await backend._portal.capture(
                    backend._sources[backend._selected]['node_id'])
                metadata = captured['source_metadata']
                record('source_diagnostic', metadata=metadata)
                try:
                    scope = await backend._scope_provider.snapshot(metadata, 'inkscape')
                    record('scope_diagnostic', scope=scope)
                except Exception as error:
                    record('scope_diagnostic', error=str(error))
                raise RuntimeError('production_authenticated_focus_unavailable')
            payload = dict(**grant, action_id=label, observation_id=frame.observation_id,
                operation={'polyline': 'drag'}.get(kind, kind), source_id=frame.source.source_id,
                source_revision=frame.source.source_revision,
                consent_generation=frame.source.consent_generation,
                expect={'type': 'visual_change'},
                **{('key' if k == 'chord' else k): value for k, value in fields.items()})
            result = await controller.act(context, payload)
            record('action', label=label, payload=payload, result=result,
                   entrypoint='ComputerController.act')
            if result['status'] not in {'executed', 'verified', 'not_satisfied'}:
                raise RuntimeError('controller_action_failed:' + result['status'])
            await asyncio.sleep(.3)
            return result

        # Printable r selects rectangle; normal canvas drag creates a shape.
        # Ctrl+S exercises the newest production native J chord implementation.
        await action('rectangle-tool', 'type', text='r')
        await action('rectangle', 'polyline',
                     points=[[420, 340], [520, 340], [520, 450]], duration=.3)
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
        if grant is not None:
            controller_stop = await controller.session(context, {**grant, 'operation': 'close'})
            record('controller_stopped', result=controller_stop)
        await controller.close()
        stopped = await backend.stop()
        record('stopped', result=stopped, task_ok=task_ok)
        store.close()
        # Detaching product transports must preserve the same existing app.
        current = Path(f'/proc/{application_pid}/stat').read_text().rsplit(')', 1)[1].split()
        preserved = current[19] == application_start and current[0] not in {'Z', 'X', 'x'}
        record('application_preserved', pid=application_pid, start=application_start,
               alive_same_process=preserved)
        if not preserved:
            raise RuntimeError('target_application_not_preserved')
        if not stopped['stopped']:
            raise RuntimeError('production_backend_cleanup_unverified')


if __name__ == '__main__':
    asyncio.run(main())
