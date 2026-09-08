"""Private fault fixture: controller exits normally while its guardian stays up.

Never owns an EI FD or calls a compositor. The guardian's only controller writer
is transferred here; _exit closes it without R/C, matching genuine process loss.
"""

import os
import sys
import time
from pathlib import Path

assert Path("/.dockerenv").exists() and os.environ["HOME"] == "/tmp/home"
assert len(sys.argv) == 2
fd = int(sys.argv[1])
os.write(fd, b"H 42 272 250 250 2000\n")
deadline = time.monotonic() + 3
while not Path("/tmp/lifecycle-release-go").exists():
    if time.monotonic() >= deadline:
        os._exit(2)
    time.sleep(0.005)
print("CONTROLLER_NORMAL_EXIT_WITH_HELD_INPUT monotonic=" + str(time.monotonic()), flush=True)
os._exit(0)
