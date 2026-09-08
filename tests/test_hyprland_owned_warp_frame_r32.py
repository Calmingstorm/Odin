"""Compile the actual warp hook against a fake frame-buffering receiver.

This is a regression fixture, not live compositor or GTK qualification. The
pinned compositor's absolute-motion path sends motion without a frame, while
its virtual-pointer frame callback returns unless an axis is pending.
"""
from pathlib import Path
import shutil
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[1]


def test_owned_absolute_vertices_receive_frames_without_changing_other_routes(tmp_path):
    compiler = shutil.which("c++")
    if not compiler:
        pytest.skip("C++ compiler unavailable")
    source = (ROOT / "assets/hyprland-input/scope-plugin.cpp").read_text()
    hook = source.split("void onWarp(", 1)[1].split("\nvoid onFocus(", 1)[0]
    hook = "void onWarp(" + hook
    harness = r'''
#include <cassert>
#include <memory>
#include <string>
#include <utility>
#include <vector>
struct Vector2D {
    double x, y;
    Vector2D operator+(Vector2D b) const { return {x+b.x,y+b.y}; }
    Vector2D operator*(Vector2D b) const { return {x*b.x,y*b.y}; }
};
struct Device {};
struct IPointer { struct SMotionAbsoluteEvent {
    std::shared_ptr<Device> device;
    Vector2D absolute;
}; };
struct CInputManager {};
using WarpFn = void (*)(CInputManager*, IPointer::SMotionAbsoluteEvent);
struct Hook { WarpFn m_original; };
struct Pointer { std::shared_ptr<Device> device; };
struct State {
    Hook* warpHook;
    std::vector<std::unique_ptr<Pointer>> pointers;
    Pointer* pointer;
    unsigned rejected = 0;
    bool allowed = true;
    struct { Vector2D outputPos{0,0}, outputSize{1,1}; } bound;
    bool allow() { return allowed; }
    bool point(Vector2D p) { return p.x>=0 && p.y>=0 && p.x<1000 && p.y<1000; }
    void revoke(const char*) { allowed=false; }
};
State* live;
// Model receiver buffering: motion updates pending position; frame delivers it.
struct Seat {
    Vector2D pending{};
    bool dirty=false;
    unsigned frames=0;
    std::vector<std::pair<double,double>> delivered;
    void sendPointerFrame() {
        ++frames;
        if (dirty) { delivered.emplace_back(pending.x,pending.y); dirty=false; }
    }
} seat;
Seat* g_pSeatManager=&seat;
unsigned originals=0;
void originalWarp(CInputManager*, IPointer::SMotionAbsoluteEvent e) {
    ++originals; seat.pending=e.absolute; seat.dirty=true;
}
'''
    harness += hook
    harness += r'''
int main() {
    Hook h{originalWarp}; State s; s.warpHook=&h; live=&s;
    auto owned=std::make_shared<Device>();
    auto otherOwned=std::make_shared<Device>();
    auto human=std::make_shared<Device>();
    s.pointers.emplace_back(std::make_unique<Pointer>(Pointer{owned}));
    s.pointers.emplace_back(std::make_unique<Pointer>(Pointer{otherOwned}));
    s.pointer=s.pointers.front().get(); CInputManager manager;
    std::vector<std::pair<double,double>> path={{550,560},{650,380},{730,500},{790,420},{920,560}};
    for (auto [x,y]:path) onWarp(&manager,{owned,{x,y}});
    assert(seat.delivered==path); assert(seat.frames==5); assert(originals==5);
    // Physical/unowned input delegates unchanged, without an added frame.
    onWarp(&manager,{human,{30,40}});
    assert(originals==6 && seat.frames==5);
    onWarp(&manager,{otherOwned,{30,40}});
    assert(originals==6 && seat.frames==5 && s.rejected==1);
    s.allowed=false;
    onWarp(&manager,{owned,{30,40}});
    assert(originals==6 && seat.frames==5);
    s.allowed=true;
    onWarp(&manager,{owned,{1001,40}});
    assert(originals==6 && seat.frames==5 && s.rejected==2 && !s.allowed);
}
'''
    cpp = tmp_path / "warp-frame.cpp"
    cpp.write_text(harness)
    binary = tmp_path / "warp-frame"
    subprocess.run([compiler, "-std=c++23", "-Wall", "-Wextra", "-Werror", str(cpp), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
    # Mutation control: the identical production hook without its completion
    # frame must lose the path, as in the reported native Pinta failure.
    missing_frame = harness.replace("    g_pSeatManager->sendPointerFrame();", "")
    assert missing_frame != harness
    cpp.write_text(missing_frame)
    subprocess.run([compiler, "-std=c++23", "-Wall", "-Wextra", "-Werror", str(cpp), "-o", str(binary)], check=True)
    result = subprocess.run([str(binary)], capture_output=True)
    assert result.returncode != 0
    assert b"seat.delivered==path" in result.stderr
