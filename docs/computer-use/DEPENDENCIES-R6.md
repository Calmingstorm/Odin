# R6 development dependency changes (2026-09-07)

Under the operator's existing permission to install needed packages, installed Inkscape
from the configured Ubuntu repositories for native GUI qualification. The dry run
and actual installation both reported seven new packages, zero upgrades and zero
removals. Recommended packages were excluded. No autoremove was run.

| Newly installed package | Version |
| --- | --- |
| inkscape | 1.2.2-2ubuntu12 |
| lib2geom1.2.0t64 | 1.2.2-3.1build1 |
| libboost-filesystem1.83.0 | 1.83.0-2.1ubuntu3.2 |
| libgsl27 | 2.7.1+dfsg-6ubuntu2 |
| libgslcblas0 | 2.7.1+dfsg-6ubuntu2 |
| libmagick++-6.q16-9t64 | 8:6.9.12.98+dfsg1-5.2build2 |
| libpotrace0 | 1.16-2build1 |

Installation used noninteractive apt with `--no-install-recommends` and
`NEEDRESTART_MODE=l`, so pending service upgrades were not restarted. Package
triggers updated normal system desktop/menu/icon caches. No user desktop settings
were changed. Post-install validation confirmed the executable, all seven package
states, unchanged Odin service process and monitor topology. This is dependency
validation, not a GUI task success claim.

Reversal is operator-owned: simulate removal of these exact seven packages first,
review reverse dependencies added since this installation, and remove only those
still unused. Do not autoremove unrelated dependencies or remove an application
while the operator is using it. LibreOffice, Xed and Drawing were already installed.
