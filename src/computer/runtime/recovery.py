"""Read-only crash reconciliation. No display access, signalling or replay."""
from __future__ import annotations

import asyncio
import hashlib
import re
import time
from pathlib import Path

from .profile import clean_environment, unit_for

MAX_IDENTITIES = 2048


def boot_id() -> str:
    value = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    if not re.fullmatch(r'[a-f0-9-]{36}', value):
        raise ValueError('boot identity unavailable')
    return value


def process_identity(pid: int) -> dict:
    text = Path(f'/proc/{pid}/stat').read_text()
    fields = text[text.rindex(')') + 2:].split()
    return {'pid': pid, 'start_ticks': int(fields[19])}


def validate_descriptor(value, session_id):
    if (type(value) is not dict or value.get('version') != 1
            or value.get('session_id') != session_id
            or value.get('kind') not in {'isolated', 'processes'}
            or not isinstance(value.get('boot_id'), str)
            or not re.fullmatch(r'[a-f0-9-]{36}', value['boot_id'])
            or type(value.get('launch_pending')) is not bool
            or type(value.get('processes')) is not list
            or len(value['processes']) > MAX_IDENTITIES):
        raise ValueError('invalid recovery descriptor')
    for entry in value['processes']:
        if (type(entry) is not dict or set(entry) != {'pid', 'start_ticks'}
                or any(type(entry[k]) is not int or entry[k] <= 0
                       for k in ('pid', 'start_ticks'))):
            raise ValueError('invalid process identity')
    common = {'version', 'session_id', 'kind', 'boot_id', 'launch_pending', 'processes'}
    if value['kind'] == 'isolated':
        token = value.get('token')
        prefix = hashlib.sha256(session_id.encode()).hexdigest()[:32] + '-'
        if (not isinstance(token, str) or not token.startswith(prefix)
                or not re.fullmatch(r'[a-f0-9]{32}-[a-f0-9]{32}', token)
                or value.get('unit') != unit_for(token)
                or (not value['launch_pending'] and not value['processes'])
                or set(value) != common | {'token', 'unit'}):
            raise ValueError('invalid unit ownership')
    elif (value.get('no_persistent_devices') is not True
          or type(value.get('input_was_enabled')) is not bool
          or set(value) != common | {'no_persistent_devices', 'input_was_enabled'}):
        raise ValueError('unknown device cleanup')
    return value


def _processes_gone(descriptor, *, proc_root=Path('/proc')):
    """PID reuse is not ownership. Zombies and unreadable identities refuse."""
    deadline = time.monotonic() + 1.5
    identities = {p['pid']: p['start_ticks'] for p in descriptor['processes']}
    for pid, started in identities.items():
        if time.monotonic() >= deadline:
            return 'process_inspection_unavailable'
        try:
            text = (proc_root / str(pid) / 'stat').read_text()
            fields = text[text.rindex(')') + 2:].split()
            if int(fields[19]) == started:
                return 'owned_process_remaining'
        except FileNotFoundError:
            continue
        except (OSError, ValueError, IndexError):
            return 'process_inspection_unavailable'
    if descriptor['kind'] == 'isolated':
        for count, entry in enumerate(proc_root.iterdir()):
            if count >= 131072 or time.monotonic() >= deadline:
                return 'process_inspection_unavailable'
            if not entry.name.isdecimal():
                continue
            try:
                text = (entry / 'stat').read_text()
                fields = text[text.rindex(')') + 2:].split()
                if int(fields[2]) in identities or int(fields[3]) in identities:
                    return 'owned_process_group_remaining'
            except FileNotFoundError:
                continue
            except (OSError, ValueError, IndexError):
                return 'process_inspection_unavailable'
    return None


async def _unit_state(unit):
    proc = await asyncio.create_subprocess_exec(
        '/usr/bin/systemctl', 'show', '--no-pager',
        '--property=Id,LoadState,ActiveState,ControlGroup,MainPID,ControlPID,Job', unit,
        stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL, env=clean_environment())
    try:
        data, _ = await asyncio.wait_for(proc.communicate(), 1.0)
        # systemctl can return 1/4 for a missing unit while supplying all of
        # the exact not-found properties. Validate those fields below; an
        # arbitrary nonzero/empty response never proves absence.
        if proc.returncode not in {0, 1, 4} or len(data) > 4096:
            return None
        return dict(line.split('=', 1) for line in data.decode().splitlines() if '=' in line)
    finally:
        if proc.returncode is None:
            proc.kill()  # Only our read-only probe, never a recovered workload.
            await proc.wait()


def _cgroup_empty(unit, *, root=Path('/sys/fs/cgroup')):
    path = root / 'system.slice' / unit
    try:
        events = dict(line.split() for line in (path / 'cgroup.events').read_text().splitlines())
        return events.get('populated') == '0'
    except FileNotFoundError:
        return not path.exists() and (root / 'cgroup.controllers').is_file()
    except (OSError, ValueError):
        return False


async def verify_absence(descriptor):
    """Bounded caller owns timeout and generation CAS. All unknowns quarantine."""
    try:
        validate_descriptor(descriptor, descriptor.get('session_id'))
        current_boot = await asyncio.to_thread(boot_id)
        if current_boot != descriptor['boot_id']:
            return {'status': 'absence_verified', 'reason': 'host_rebooted'}
        if descriptor['launch_pending']:
            return {'status': 'unknown', 'reason': 'launch_identity_incomplete'}
        # Prove no launch-capable supervisor/helper remains BEFORE inspecting
        # its unit; the reverse order races a delayed unit launch.
        reason = await asyncio.to_thread(_processes_gone, descriptor)
        if reason:
            return {'status': 'unknown', 'reason': reason}
        if descriptor['kind'] == 'isolated':
            unit = descriptor['unit']
            state = await _unit_state(unit)
            if (state is None or state.get('Id') != unit
                    or state.get('LoadState') not in {'loaded', 'not-found'}
                    or state.get('ActiveState') not in {'inactive', 'failed'}
                    or state.get('MainPID') != '0' or state.get('ControlPID') != '0'
                    or state.get('Job') not in {'', '0'}
                    or state.get('ControlGroup') not in {'', f'/system.slice/{unit}'}):
                return {'status': 'unknown', 'reason': 'unit_absence_unproven'}
            if not await asyncio.to_thread(_cgroup_empty, unit):
                return {'status': 'unknown', 'reason': 'cgroup_absence_unproven'}
        if descriptor.get('input_was_enabled'):
            return {'status': 'unknown', 'reason': 'owned_input_release_unproven'}
        return {'status': 'absence_verified', 'reason': 'owned_runtime_gone'}
    except Exception:
        return {'status': 'unknown', 'reason': 'inspection_unavailable'}
