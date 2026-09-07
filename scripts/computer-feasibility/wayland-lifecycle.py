"""Two bounded, harmless lifecycle trials. Private simulated operator only."""
import json
import os
from pathlib import Path
import subprocess
import time

def needs_operator_alt_cycle(sample):
    # The simulator's Alt+Tab can lose its release at focus-out. Do not erase the
    # ledger or infer a release from focus/state=0. Deliver a new explicit owned
    # Alt press/release under actual focus, then require the unchanged clean gate.
    return bool(sample and sample['active'] and sample['toplevel_focus'] and
                sample['focused'] and sample['keys'] == [65513] and
                not sample['buttons'] and sample['state'] == 0)


def report(kind, **values):
    print(json.dumps(dict(kind=kind, monotonic=time.monotonic(), **values)), flush=True)


def wait_for(predicate, seconds=25):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if predicate(): return
        time.sleep(.1)
    raise RuntimeError('bounded private-operator wait expired')


def operator(*args):
    result = subprocess.run(['xdotool', *args], env={**os.environ, 'DISPLAY': ':77'},
                            capture_output=True, text=True, timeout=5)
    result.check_returncode()
    report('simulated_operator', args=args)


def atspi_nodes(node, depth=0):
    if depth > 15: return
    try:
        yield node
        for child in node: yield from atspi_nodes(child, depth+1)
    except Exception: return


def app_text():
    texts = []
    for app in pyatspi.Registry.getDesktop(0):
        try: name = app.name
        except Exception: continue
        if 'gedit' in name:
            for node in atspi_nodes(app):
                try:
                    text = node.queryText()
                    texts.append(text.getText(0, text.characterCount))
                except Exception: pass
    return texts


def receiver_rows():
    rows = []
    for line in Path('/evidence/receiver.log').read_text().splitlines():
        if not line.startswith('{'): continue
        try: rows.append(json.loads(line))
        except json.JSONDecodeError:
            if line.endswith('}'): raise
    errors = [r for r in rows if r['kind'] == 'telemetry_error']
    if errors: raise RuntimeError('receiver telemetry failed: ' + json.dumps(errors[-1]))
    return rows


def receiver_sample(after):
    samples = [r for r in receiver_rows() if r['kind'] == 'sample' and r['monotonic'] > after]
    if not samples or time.monotonic() - samples[-1]['monotonic'] > .5: return None
    return samples[-1]


def editor_focus_evidence(app):
    evidence = []
    for candidate in pyatspi.Registry.getDesktop(0):
        try:
            if candidate.get_process_id() != app.pid: continue
        except Exception: continue
        for node in atspi_nodes(candidate):
            try:
                states = node.getState()
                if node.getRoleName() in ('frame', 'text'):
                    evidence.append(dict(role=node.getRoleName(), name=node.name,
                        active=states.contains(pyatspi.STATE_ACTIVE),
                        focused=states.contains(pyatspi.STATE_FOCUSED),
                        showing=states.contains(pyatspi.STATE_SHOWING),
                        editable=states.contains(pyatspi.STATE_EDITABLE)))
            except Exception: continue
    return evidence


def activate(target, app=None):
    # Alt+Tab belongs ONLY to the separately simulated operator on private :77.
    # grabFocus/present success is not top-level activation evidence.
    for attempt in range(5):
        boundary = time.monotonic()
        if attempt: operator('key', 'alt+Tab')
        time.sleep(.35)
        if target == 'receiver':
            sample = receiver_sample(boundary)
            good = sample and sample['active'] and sample['toplevel_focus'] and sample['focused']
            evidence = sample
        else:
            evidence = editor_focus_evidence(app)
            good = any(r['role'] == 'frame' and r['active'] for r in evidence)
            if good:
                for candidate in pyatspi.Registry.getDesktop(0):
                    try:
                        if candidate.get_process_id() != app.pid: continue
                    except Exception: continue
                    for node in atspi_nodes(candidate):
                        try:
                            state = node.getState()
                            if node.getRoleName() == 'text' and state.contains(pyatspi.STATE_EDITABLE) and state.contains(pyatspi.STATE_SHOWING):
                                node.queryComponent().grabFocus()
                                break
                        except Exception: continue
                time.sleep(.15)
                evidence = editor_focus_evidence(app)
                good = (any(r['role'] == 'frame' and r['active'] for r in evidence) and
                        any(r['role'] == 'text' and r['focused'] and r['editable'] and r['showing'] for r in evidence))
        report('fresh_top_level_evidence', target=target, attempt=attempt, good=bool(good), evidence=evidence)
        if good: return
    raise RuntimeError('bounded actual top-level activation not established: ' + target)


def wait_state(after, predicate, label, seconds=3):
    found = []
    def check():
        sample = receiver_sample(after)
        if sample and sample['active'] and sample['focused'] and predicate(sample):
            found.append(sample)
            return True
        return False
    wait_for(check, seconds)
    report('delivered_state', label=label, sample=found[-1])
    return found[-1]


def editor_marker(app, marker):
    activate('editor', app)
    operator('type', '--delay', '40', marker)
    time.sleep(.5)
    texts = app_text()
    report('real_application_marker', pid=app.pid, alive=app.poll() is None, marker=marker, texts=texts)
    if app.poll() is not None or not any(marker in s for s in texts):
        raise RuntimeError('real application subsequent human marker not confirmed')


def main():
    global pyatspi
    assert Path('/.dockerenv').exists() and os.environ['HOME'] == '/tmp/home'
    assert os.environ.get('WAYLAND_LIFECYCLE_LAB') == '1'
    import pyatspi
    app_log = open('/evidence/gedit.log', 'w')
    app = subprocess.Popen(['gedit', '--standalone', '--new-window'],
                           stdout=app_log, stderr=subprocess.STDOUT)
    wait_for(lambda: app_text() != [])
    editor_marker(app, 'beforeattachmarker')
    report('real_app_started_before_attach', pid=app.pid)
    trials = []
    failures = []
    modes = (('guardian-orderly', 'guardian-eof', 'guardian-cancel', 'guardian-lease')
             if os.environ.get('WAYLAND_GUARDIAN_LAB') == '1' else ('orderly', 'eof'))
    if os.environ.get('WAYLAND_GUARDIAN_FAULTS') == '1':
        modes += ('guardian-loss', 'guardian-revoke')
    for mode in modes:
        for name in ('ready', 'go', 'exited', 'held', 'release-go'):
            Path('/tmp/lifecycle-' + name).unlink(missing_ok=True)
        log = Path('/evidence/portal-' + mode + '.jsonl')
        with log.open('w') as output:
            portal = subprocess.Popen(['python3', '/harness/wayland-portal.py'],
                         stdout=output, stderr=subprocess.STDOUT,
                         env={**os.environ, 'WAYLAND_LIFECYCLE_MODE': mode})
            human_ctrl = False
            try:
                wait_for(lambda: '"method": "Start"' in log.read_text())
                time.sleep(1)
                # Existing explicit private-lab consent UI action, never the portal
                # client approving itself and never any real-session permission.
                for role, name in [('check box', 'Allow Remote Interaction'),
                                   ('push button', 'Share')]:
                    result = subprocess.run(['python3', '/harness/wayland-operator.py', role, name],
                                   capture_output=True, text=True, timeout=8)
                    Path('/evidence/consent-' + mode + '-' + role.replace(' ', '-') + '.txt').write_text(result.stdout + result.stderr)
                    if result.returncode or 'OPERATOR_UI_ACTION' not in result.stdout or 'True' not in result.stdout:
                        raise RuntimeError('genuine consent UI action not observed')
                    time.sleep(.5)
                wait_for(lambda: Path('/tmp/lifecycle-ready').exists())
                activate('receiver')
                operator('mousemove', '250', '250', 'click', '1')
                baseline = time.monotonic()
                time.sleep(.2)
                before = receiver_sample(baseline)
                if needs_operator_alt_cycle(before):
                    report('simulator_alt_cycle_begin', mode=mode, sample=before,
                           reason='prior simulator Alt+Tab release missed by focused-entry ledger')
                    operator('keydown', 'Alt_L', 'keyup', 'Alt_L')
                    # A fresh release event is mandatory, not mask-only recovery.
                    wait_for(lambda: any(r['kind'] == 'event' and r['monotonic'] > baseline
                        and 'KEY_RELEASE' in r['type'] and r['key'] == 65513
                        for r in receiver_rows()), 2)
                    baseline = time.monotonic()
                wait_state(baseline, lambda s: not s['keys'] and not s['buttons'] and not (s['state'] & 261), mode + ':clean_before_hold')
                human_start = time.monotonic()
                operator('keydown', 'Control_R')
                human_ctrl = True
                wait_state(human_start, lambda s: 65508 in s['keys'] and s['state'] & 4, mode + ':human_control_delivered')
                owned_start = time.monotonic()
                Path('/tmp/lifecycle-go').touch()
                wait_for(lambda: Path('/tmp/lifecycle-held').exists(), 8)
                held = wait_state(owned_start, lambda s: {65508,65505}.issubset(s['keys']) and 1 in s['buttons'] and s['state'] & 261 == 261, mode + ':owned_and_human_delivered')
                release_authorized = time.monotonic()
                Path('/tmp/lifecycle-release-go').touch()
                wait_for(lambda: Path('/tmp/lifecycle-exited').exists(), 15)
                try:
                    released = wait_state(release_authorized, lambda s: 65508 in s['keys'] and 65505 not in s['keys'] and not s['buttons'] and s['state'] & 261 == 4, mode + ':owned_released_human_preserved', 1.3)
                except RuntimeError as exc:
                    if mode != 'eof': raise
                    # Preserve the failed strict release gate. Collect post-Close
                    # evidence without a synthetic pointer click/release, then
                    # fail the complete command even if applications survive.
                    failures.append(dict(mode=mode, gate='owned_release', reason=str(exc)))
                    report('release_gate_FAILED', mode=mode, latest=receiver_sample(release_authorized))
                    portal.wait(timeout=8)
                    if portal.returncode or 'owned_session_closed' not in log.read_text():
                        raise RuntimeError('failed-release diagnostic lacked genuine Close')
                    after_close = time.monotonic()
                    time.sleep(.3)
                    report('failed_release_post_close_sample', mode=mode, sample=receiver_sample(after_close))
                    operator('keyup', 'Control_R')
                    human_ctrl = False
                    receiver_pid = int(Path('/evidence/receiver.pid').read_text())
                    os.kill(receiver_pid, 0)
                    activate('receiver')
                    marker_start = time.monotonic()
                    operator('type', '--delay', '40', 'aftercloseeof')
                    sample = wait_state(marker_start, lambda s: 'aftercloseeof' in s['text'], 'eof:receiver_fresh_marker_despite_failed_release')
                    report('receiver_survived_close', mode=mode, pid=receiver_pid, sample=sample,
                           owned_release_pass=False)
                    editor_marker(app, 'aftereofmarker')
                    trials.append(dict(mode=mode, portal_exit=portal.returncode, owned_release_pass=False))
                    continue
                events = [r for r in receiver_rows() if r['kind'] == 'event' and release_authorized < r['monotonic'] < released['monotonic']]
                if not any('KEY_RELEASE' in r['type'] and r['key'] == 65505 for r in events) or not any('BUTTON_RELEASE' in r['type'] and r['button'] == 1 for r in events):
                    raise RuntimeError('release event ledger evidence absent despite sampled state')
                if any('KEY_RELEASE' in r['type'] and r['key'] == 65508 for r in events):
                    raise RuntimeError('human Control_R was released during owned detach')
                report('release_observation', mode=mode, held=held, released=released,
                       gate_to_observed_ms=(released['monotonic']-release_authorized)*1000,
                       measurement='application ledger plus GDK cached seat mask; not independent compositor seat query')
                human_release = time.monotonic()
                operator('keyup', 'Control_R')
                human_ctrl = False
                wait_state(human_release, lambda s: not s['keys'] and not s['buttons'] and not (s['state'] & 261), mode + ':human_deliberately_released')
                portal.wait(timeout=8)
                if portal.returncode: raise RuntimeError('portal probe failed')
                if 'owned_session_closed' not in log.read_text():
                    raise RuntimeError('genuine owned portal Close not confirmed')
                receiver_pid = int(Path('/evidence/receiver.pid').read_text())
                os.kill(receiver_pid, 0)
                activate('receiver')
                marker = 'afterclose' + mode
                marker_start = time.monotonic()
                operator('type', '--delay', '40', marker)
                sample = wait_state(marker_start, lambda s: marker in s['text'], mode + ':receiver_fresh_marker')
                report('receiver_survived_close', mode=mode, pid=receiver_pid, sample=sample)
                if app.poll() is not None:
                    raise RuntimeError('real editor exited during lifecycle trial')
                editor_marker(app, 'after' + mode + 'marker')
                trials.append(dict(mode=mode, portal_exit=portal.returncode))
            finally:
                if human_ctrl: operator('keyup', 'Control_R')
                if portal.poll() is None:
                    portal.terminate()
                    try: portal.wait(timeout=4)
                    except subprocess.TimeoutExpired:
                        portal.kill()
                        portal.wait()
    # Existing normal application survives both detach paths. Subsequent operator
    # keyboard delivery is checked through its accessible document, not PID alone.
    try:
        editor_marker(app, 'realapplicationhumanmarker')
    finally:
        report('fixture_apps_still_alive_before_teardown', receiver_pid=receiver_pid,
               gedit_pid=app.pid, gedit_alive=app.poll() is None)
    Path('/evidence/lifecycle-driver.json').write_text(json.dumps(trials, indent=2))
    if failures:
        Path('/evidence/lifecycle-failures.json').write_text(json.dumps(failures, indent=2))
        raise RuntimeError('strict lifecycle gate failed; survival does not erase failure: ' + json.dumps(failures))


if __name__ == '__main__':
    main()
