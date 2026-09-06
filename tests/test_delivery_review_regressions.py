"""Review pins through the actual executor/runtime/Discord delivery guards."""
import json
import sqlite3
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.discord.response_guards import truncate_tool_output
from src.tools import output_delivery, output_retention
from src.tools.output_delivery import RankedOutput, deliver, render_page
from src.tools.output_retention import OutputStore
from src.tools.runtime_delivery import deliver_runtime_output
from tests.test_executor_output_retention import executor


@pytest.mark.parametrize("failure", ["none", "oversized", "global", "sqlite", "scope",
                                    "disabled", "runtime", "shim"])
def test_failed_retention_preserves_scrubbed_head_tail(tmp_path, monkeypatch, failure):
    body = ('HEAD-SENTINEL\npassword=fixtureSecretOne\n' + 'middle record\n' * 3000
            + 'password=fixtureSecretTwo\nTAIL-SENTINEL')
    store = OutputStore(tmp_path / 'output.sqlite')
    if failure == 'oversized':
        store.per_result_bytes = 1000
    elif failure == 'global':
        store.global_bytes = 1000
    elif failure == 'sqlite':
        monkeypatch.setattr(store, '_db',
                            Mock(side_effect=sqlite3.OperationalError('private path')))
    elif failure == 'none':
        store = None
    if failure == 'disabled':
        ex = executor(tmp_path)
        ex._builtin_policy = SimpleNamespace(is_disabled=lambda _: True)
        result = ex.deliver_output(body, tool_name='search_history', tool_input={}, user_id='owner')
    elif failure == 'runtime':
        result = deliver_runtime_output(object(), body, tool_name='test', tool_input={},
                                        user_id='owner')
    elif failure == 'shim':
        result = truncate_tool_output(body)
    else:
        result = deliver(body, store=store, owner='' if failure == 'scope' else 'owner')
    assert len(result) <= 12000
    assert truncate_tool_output(result) == result
    page = json.loads(result)
    assert page['retention'] == 'failed' and page['cursor'] is None
    assert page['error'] and 'private path' not in result
    assert 'HEAD-SENTINEL' in page['head']
    assert 'TAIL-SENTINEL' in page['tail']['text']
    assert 'fixtureSecret' not in result


@pytest.mark.parametrize('ranked', [False, True])
def test_oversized_never_scrubs_full_payload(tmp_path, monkeypatch, ranked):
    body = 'HEAD\n' + 'data\n' * 900000 + 'TAIL'
    text = RankedOutput('clipped preview', matches=(body,)) if ranked else body
    calls = []
    original = output_delivery.scrub_output_secrets
    def scrub(value):
        calls.append(len(value))
        assert len(value) <= 12256
        return original(value)
    monkeypatch.setattr(output_delivery, 'scrub_output_secrets', scrub)
    monkeypatch.setattr(output_retention, 'scrub_output_secrets', scrub)
    ex = executor(tmp_path)
    result = ex.deliver_output(text, tool_name='search_history', tool_input={}, user_id='owner')
    assert json.loads(result)['retention'] == 'failed'
    assert calls and max(calls) <= 12256


async def test_real_executor_oversized_capture_checks_size_before_scrubbing(tmp_path, monkeypatch):
    from unittest.mock import AsyncMock
    ex = executor(tmp_path)
    body = 'HEAD\n' + 'record\n' * 700000 + 'TAIL'
    ex._handle_run_command = AsyncMock(return_value=body)
    original = output_delivery.scrub_output_secrets
    calls = []
    def scrub(value):
        calls.append(len(value))
        assert len(value) <= 12256
        return original(value)
    monkeypatch.setattr(output_delivery, 'scrub_output_secrets', scrub)
    monkeypatch.setattr(output_retention, 'scrub_output_secrets', scrub)
    response = await ex.execute('run_command', {'host': 'testhost', 'command': 'fixture'},
                                user_id='owner')
    page = json.loads(response.output)
    assert page['retention'] == 'failed' and page['cursor'] is None
    assert 'HEAD' in page['head'] and 'TAIL' in page['tail']['text']
    assert calls and max(calls) <= 12256


def test_failure_preview_secret_at_slice_edges():
    secret = 'ghp_' + 'A' * 36
    body = 'HEAD\n' + 'x ' * 5995 + secret + '\n' + 'y' * 20000
    result = deliver(body)
    assert secret not in result and 'ghp_' not in json.loads(result)['head']
    body = 'HEAD\npassword=' + 'privatefragment' * 2000 + '\nTAIL'
    result = deliver(body)
    assert 'privatefragment' not in result
    assert 'TAIL' in json.loads(result)['tail']['text']


@pytest.mark.parametrize('length', [200, 11999, 12000, 12001])
def test_ranked_clipped_list_stays_plain_until_list_exceeds_budget(tmp_path, length):
    text = RankedOutput('s' * length, matches=('full first ' * 2000, 'second'))
    store = OutputStore(tmp_path / 'rank.sqlite')
    output = deliver(text, store=store, owner='owner', channel='room')
    assert len(output) <= 12000 and truncate_tool_output(output) == output
    if length <= 12000:
        assert not output.startswith('{')
        preview, cursor = output.split('\nfull matches: get_tool_output cursor=')
        assert preview.startswith('s' * min(length, 11000))
        snap, offset = store.read(cursor, owner='owner', channel='room', authorize=lambda *_: True)
        assert offset == 0
        assert snap.text == '\n\n'.join(text.matches)
        page = json.loads(render_page(snap))
        assert page['matches']['total_returned'] == 2
    else:
        assert json.loads(output)['matches']['total_returned'] == 2


async def test_retrieval_default_schema_and_real_handler_agree(tmp_path):
    from src.tools.registry import TOOL_MAP
    ex = executor(tmp_path)
    result = ex.deliver_output('x' * 30000, tool_name='search_history', tool_input={},
                              user_id='owner')
    cursor = json.loads(result)['cursor']
    response = await ex.execute('get_tool_output', {'cursor': cursor}, user_id='owner')
    page = json.loads(response.output)
    assert page['end'] - page['start'] == 4000
    schema = TOOL_MAP['get_tool_output']['input_schema']['properties']['limit']
    assert schema['minimum'] == 4 and schema['default'] == 4000
    for limit in (1, 2, 3):
        response = await ex.execute('get_tool_output', {'cursor': cursor, 'limit': limit},
                                    user_id='owner')
        assert not response.ok and 'limit must' in response.output
