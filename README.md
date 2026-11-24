# luci-app-rtl9617c-pon

LuCI Web UI and RPCD backends for Realtek RTL9617C (Taurus) PON/ONU management, hardware forwarding status, BOSA optical telemetry, TRNG status, and CPU frequency scaling.

## Features

- Live PON link status (EPON / 10G EPON / GPON / XG-PON / XGS-PON), OAM/OMCI authentication, optical DDMI telemetry
- Live hardware forwarding engine (L2/L3 FE, PE, QM DeepQ) visualization and flow table inspection
- Hardware identity, TRNG entropy, and port MTU/Baby Jumbo overview
- Live CPU frequency scaling UI (`schedutil` / `performance` / `ondemand` / `conservative` / `powersave` / `userspace`) with real-time frequency progress bar, 8-step OPP indicator, and SoC thermal monitor

## Installation via OpenWrt / ImmortalWrt Feed

Add the unified feed to `feeds.conf.default`:

```
src-git rtl9617c https://github.com/crysister/rtl9617c-packages.git
```

Then update and install:

```sh
./scripts/feeds update rtl9617c
./scripts/feeds install -a -p rtl9617c
```

Optional: apply `feed-patches/100-rtl9617c-system-status.patch` to `feeds/luci` via `feeds/rtl9617c/apply-luci-patches.sh` to show SoC temperature and TRNG status on the LuCI Overview page.

## License

GPL-2.0-or-later
