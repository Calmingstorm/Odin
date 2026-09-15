"""Production same() with inert seat/window doubles, no display or input.

Elsewhere is a foreign seat-focus identity, including the other-output case.
This proves the guard contract, not live monitor delivery or compositor focus.
"""
import shutil
import subprocess

import pytest

from tests.test_hyprland_selection_native_contract_campaign import (
    NATIVE_FIXTURE,
    ROOT,
    SOURCE,
    extract,
)

HARNESS = r'''
template<class T> bool operator==(const WP<T>& a, const WP<T>& b) { return a.lock()==b.lock(); }
struct PopupWatch { bool valid=true, action=false; };
using SubsurfaceNode = int;
struct Snapshot {
    uint64_t revision=9, groupEpoch=0;
    std::string groupToken;
    WP<CWLSurfaceResource> surface, pointerSurface;
    PHLWINDOWREF window; PHLMONITORREF monitor;
    std::vector<SubsurfaceNode> subsurfaces;
    std::vector<int> popups;
    std::shared_ptr<PopupWatch> popupWatch=std::make_shared<PopupWatch>();
    std::shared_ptr<int> processFD;
    ProcessImage image;
    std::vector<odin_scope::NativeAncestor> ancestry;
    int pid=0, uid=0;
    std::string startTicks, app;
    bool modal=false;
    Vector2D pos, size, outputPos, outputSize, pixelSize;
    float scale=1; int transform=0;
};
struct Seat { struct { WP<CWLSurfaceResource> keyboardFocus, pointerFocus; } m_state; } seat;
auto* g_pSeatManager=&seat;
struct State {
    bool armed=false, environmentOK=true;
    uint64_t revision=9;
    struct Group {uint64_t epoch=0;};
    std::map<std::string,Group> applicationGroups;
    Snapshot bound;
    struct Device { std::string m_boundOutput="DP-1"; } device;
    struct Pointer { Device* device; } pointerValue{&device};
    Pointer* pointer=&pointerValue;
    bool environment() const {return environmentOK;}
    bool groupMember(const Group&, PHLWINDOW) const {return false;}
    bool actionTopology(const Snapshot&) const {return true;}
    bool subsurfaceInventory(const Snapshot&, std::vector<SubsurfaceNode>&) const {return true;}
    std::vector<int> popupInventory(const Snapshot&) const {return {};}
    bool provenance(PHLWINDOW, std::vector<odin_scope::NativeAncestor>& out) const {
        out={{42,getpid(),int64_t(getuid())}}; return true;
    }
    bool destination(const Snapshot& b, std::shared_ptr<CWLSurfaceResource> s) const {
        return s && s==b.surface.lock();
    }
    // PRODUCTION_SAME
};
int main(int argc, char** argv) {
    assert(argc==2); const std::string mode=argv[1];
    State state; auto& b=state.bound;
    auto monitor=std::make_shared<Monitor>();
    auto window=std::make_shared<Window>(); window->m_monitor=monitor;
    Desktop::focus.focused=window; Desktop::focus.focusedMonitor=monitor;
    b.window=window; b.monitor=monitor; b.surface=window->resource();
    b.pos=window->m_realPosition->value(); b.size=window->m_realSize->value();
    b.outputPos=monitor->m_position; b.outputSize=monitor->m_size;
    b.pixelSize=monitor->m_pixelSize; b.app=window->m_class;
    state.provenance(window,b.ancestry); b.pid=getpid(); b.uid=getuid();
    b.startTicks=processStartTicks(b.pid); b.image=processImage(b.pid);
    int fd=syscall(SYS_pidfd_open,b.pid,0); assert(fd>=0);
    b.processFD=std::shared_ptr<int>(new int(fd),[](int* p){close(*p);delete p;});
    auto elsewhere=std::make_shared<CWLSurfaceResource>();
    auto changed=std::make_shared<CWLSurfaceResource>();
    // Snapshot captures actual resting focus, never coerces it to target.
    seat.m_state.keyboardFocus=window->resource();
    seat.m_state.pointerFocus=elsewhere;
    if(mode=="no-pointer-focus") seat.m_state.pointerFocus.reset();
    b.pointerSurface=seat.m_state.pointerFocus;
    if(mode=="target-pointer") b.pointerSurface=seat.m_state.pointerFocus=window->resource();
    if(mode=="armed-resting") state.armed=true;
    if(mode=="changed-pointer") seat.m_state.pointerFocus=changed;
    if(mode=="wrong-keyboard") seat.m_state.keyboardFocus=elsewhere;
    if(mode=="wrong-window") Desktop::focus.focused=std::make_shared<Window>();
    auto otherMonitor=std::make_shared<Monitor>();
    if(mode=="wrong-monitor") Desktop::focus.focusedMonitor=otherMonitor;
    if(mode=="wrong-device-output") {state.armed=true; state.device.m_boundOutput="DP-2";}
    if(mode=="locked") state.environmentOK=false;
    if(mode=="stale-epoch") ++state.revision;
    if(mode=="xwayland") window->m_isX11=true;
    if(mode=="changed-surface") window->surface=changed;
    if(mode=="changed-ancestry") ++b.ancestry.front().pid;
    if(mode=="changed-process") b.startTicks="1";
    if(mode=="changed-output") monitor->m_position.x+=1;
    if(mode=="changed-geometry") window->m_realPosition->v.x+=1;
    const bool expected=mode=="resting-elsewhere" || mode=="armed-resting" ||
        mode=="no-pointer-focus" || mode=="target-pointer";
    assert(state.same(b)==expected);
    assert(!state.destination(b,elsewhere));
}
'''


@pytest.fixture(scope="module")
def resting_pointer_binary(tmp_path_factory):
    source = SOURCE.read_text()
    prefix = NATIVE_FIXTURE.split("// PRODUCTION_CANDIDATE", 1)[0].replace(
        "// PRODUCTION_HELPERS", extract(source, "using J = ", "bool releaseCommandID(")
    )
    same = extract(source, "    bool same(const Snapshot& b,", "    bool scope()")
    harness = prefix + "\n#include <cassert>\n" + HARNESS.replace("// PRODUCTION_SAME", same)
    directory = tmp_path_factory.mktemp("resting-pointer-native")
    cpp, binary = directory / "resting.cpp", directory / "resting"
    cpp.write_text(harness)
    compiler = shutil.which("g++-14") or shutil.which("g++")
    assert compiler
    subprocess.run(
        [compiler, "-std=c++23", "-Wall", "-Wextra", str(cpp),
         "-I", str(ROOT / "assets/hyprland-input"), "-ljson-c", "-o", str(binary)],
        check=True, capture_output=True, text=True, timeout=60,
    )
    return binary


@pytest.mark.parametrize("mode", [
    "resting-elsewhere", "armed-resting", "no-pointer-focus", "target-pointer",
    "changed-pointer", "wrong-keyboard", "wrong-window", "wrong-monitor",
    "wrong-device-output", "locked", "stale-epoch", "xwayland",
    "changed-surface", "changed-ancestry", "changed-process", "changed-output",
    "changed-geometry",
])
def test_production_same_allows_resting_pointer_not_foreign_authority(resting_pointer_binary, mode):
    subprocess.run([str(resting_pointer_binary), mode], check=True, capture_output=True, timeout=5)
