"""Cross-surface parity for the generic scheduled report format field."""
from __future__ import annotations

import inspect
from pathlib import Path

from src.discord.native_tools.scheduling import SchedulingTools
from src.scheduler.scheduler import Scheduler
from src.tools.registry import TOOL_MAP
from src.web.api.schedules_api import register_schedules

FORMAT = "paginated_embed_v1"
ROOT = Path(__file__).resolve().parents[1]


def test_native_tool_schemas_agree_on_report_format():
    create = TOOL_MAP["schedule_task"]["input_schema"]["properties"]["report_format"]
    update = TOOL_MAP["update_schedule"]["input_schema"]["properties"]["report_format"]
    assert create["enum"] == [FORMAT]
    assert update["enum"] == [FORMAT, ""]
    assert "generic" in create["description"].lower()
    assert "generic" in update["description"].lower()


def test_scheduler_native_and_web_surfaces_all_forward_the_field():
    add_signature = inspect.signature(Scheduler.add)
    update_signature = inspect.signature(Scheduler.update)
    assert "report_format" in add_signature.parameters
    assert "report_format" in update_signature.parameters

    native = inspect.getsource(SchedulingTools)
    web = inspect.getsource(register_schedules)
    assert 'report_format=inp.get("report_format")' in native
    assert '"report_format",' in native
    assert web.count('report_format=data.get("report_format")') == 2


def test_webui_create_and_readback_use_the_same_field_and_literal():
    source = (ROOT / "ui/js/pages/schedules.js").read_text()
    assert "form.report_format" in source
    assert "payload.report_format = f.report_format" in source
    assert "s.report_format || ''" in source
    assert "report_format: reportFormat" in source
    assert f'value="{FORMAT}"' in source
