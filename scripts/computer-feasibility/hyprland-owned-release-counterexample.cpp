/* R31 source-logic counterexample, NOT a native compositor/receiver test.
 *
 * Build: c++ -std=c++20 -Wall -Wextra -Werror -O2 this-file.cpp -o /tmp/r31-proof
 * No Wayland connection, input device, display, thread, or process-kill action.
 *
 * Hyprland: 39d7e209c79d451efab1b21151d5938289da838d
 * Aquamarine v0.12.1: 06669631175b4db2383b94e7f8c13f45a9d28757
 *
 * Isolates three upstream decision blocks with ordinary stable focus, pointer
 * capability, no bindings/decorations/DnD interception, and successful delivery.
 * Device state outside those blocks is an independent oracle, NOT compositor
 * ownership accounting. We grant the survivor perfect death detection and exact
 * original-resource release. This demonstrates why even that assumption fails
 * the full mixed-source guarantee; it does not test a watchdog or SIGKILL.
 *
 * The input-list and receiver transitions below preserve the upstream logic;
 * containers/logging are simplified. Aquamarine's seat count is supplied by a
 * model of two independent libinput devices, not an actual libinput instance.
 */
#include <algorithm>
#include <iostream>
#include <list>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

constexpr unsigned BUTTON = 272;

struct Pipeline {
    std::list<unsigned> held;
    std::vector<unsigned> receiverPressed;
    std::vector<bool> wire;

    void receiver(unsigned button, bool pressed) {
        // protocols/core/Seat.cpp:226-239, with native preconditions satisfied.
        const bool contains = std::ranges::find(receiverPressed, button) != receiverPressed.end();
        if ((!pressed && !contains) || (pressed && contains))
            return;
        if (!pressed)
            std::erase(receiverPressed, button);
        else
            receiverPressed.emplace_back(button);
        wire.push_back(pressed);
    }

    void input(unsigned button, bool pressed) {
        // managers/input/InputManager.cpp:726-731. Note: no owner argument.
        if (pressed) {
            held.push_back(button);
        } else {
            if (std::ranges::find_if(held, [&](const auto& other) { return other == button; }) == held.end())
                return;
            std::erase_if(held, [&](const auto& other) { return other == button; });
        }
        // InputManager.cpp:892 -> SeatManager.cpp:294-307.
        receiver(button, pressed);
    }

    void libinput(unsigned button, bool pressed, unsigned seatCountAfter) {
        // Aquamarine src/backend/Session.cpp:579-592.
        if ((pressed && seatCountAfter != 1) || (!pressed && seatCountAfter != 0))
            return;
        input(button, pressed);
    }

    bool receiverDown() const {
        return std::ranges::find(receiverPressed, BUTTON) != receiverPressed.end();
    }
};

static void require(bool condition, std::string_view message) {
    if (!condition)
        throw std::runtime_error(std::string(message));
}

int main() {
    try {
        {
            Pipeline p;
            p.input(BUTTON, true);
            p.input(BUTTON, false);
            require(p.held.empty() && !p.receiverDown() && p.wire == std::vector<bool>{true, false},
                    "sole-owner explicit release control");
            std::cout << "CONTROL sole-owner explicit release: clears modeled receiver\n";
        }
        {
            Pipeline p;
            bool humanDown = true;
            p.libinput(BUTTON, true, 1);  // Human physical device.
            p.input(BUTTON, true);       // Odin Wayland virtual pointer.
            p.input(BUTTON, false);      // Perfect survivor, original resource.
            require(humanDown && !p.receiverDown() && p.held.empty(),
                    "original-resource release must expose physical overlap counterexample");
            require(p.wire == std::vector<bool>{true, false}, "premature up trace");
            p.libinput(BUTTON, false, 0);
            humanDown = false;
            require(!humanDown && p.wire.size() == 2, "later human release is suppressed");
            std::cout << "COUNTEREXAMPLE physical + Odin Wayland: premature up; later human up suppressed\n";
        }
        {
            Pipeline p;
            p.libinput(BUTTON, true, 1);   // Human physical device.
            p.libinput(BUTTON, true, 2);   // Odin uinput device.
            p.libinput(BUTTON, false, 1);  // Grant perfect owned removal/release.
            require(p.receiverDown() && p.wire == std::vector<bool>{true},
                    "libinput-only cohort must preserve overlapping physical hold");
            p.libinput(BUTTON, false, 0);
            require(!p.receiverDown() && p.wire == std::vector<bool>{true, false},
                    "libinput-only last release control");
            std::cout << "CONTROL libinput-only overlap: preserved, then last release clears\n";
        }
        {
            Pipeline p;
            const bool otherVirtualDown = true;
            p.input(BUTTON, true);        // Non-Odin Wayland virtual pointer.
            p.libinput(BUTTON, true, 1);  // Odin uinput device, independent count.
            p.libinput(BUTTON, false, 0); // Grant perfect removal-generated release.
            require(otherVirtualDown && !p.receiverDown() && p.held.empty() &&
                        p.wire == std::vector<bool>{true, false},
                    "mixed uinput/Wayland overlap must expose counterexample");
            std::cout << "COUNTEREXAMPLE other Wayland + Odin uinput: premature up despite perfect owned removal\n";
        }
        std::cout << "SOURCE-LOGIC EXPECTATIONS MET; native cases=0; receiver evidence=none; live gate=CLOSED\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "SOURCE-LOGIC CHECK FAILED: " << error.what() << '\n';
        return 1;
    }
}
