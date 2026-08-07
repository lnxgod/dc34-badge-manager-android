# Signed firmware recovery

The Android manager is guidance-only for firmware recovery. It does not automate Xous flashing or enter developer mode.

Official DC34 recovery ZIP:

- <https://defcon.org/34b/latest.zip>
- Snapshot verified on 2026-08-06: `17f0f4d08debe2481ef7de0a4ab5ec92cc383ab7ed8ec06dc0bf1686852105f7`

Files in that snapshot:

| File | SHA-256 |
| --- | --- |
| `loader.uf2` | `916704a57f766b412c4e19016071a63e93c14b9a66cb1ca5d44196b11a0a3e00` |
| `xous.uf2` | `098c2566b8e2fdd9f698c478bd4deeba0c03da26cb679014a99d3951ec044a74` |
| `swap.uf2` | `54c400cb37da0a87b48cf775619564096d4b6274cfe39deaf5198b1ce0fd8870` |

The publisher may replace `latest.zip`; verify current official instructions and hashes before recovery.

## Official workflow

1. Hold any badge button while resetting or power cycling to enter update mode.
2. Extract `loader.uf2`, `xous.uf2`, and `swap.uf2` to the badge's USB mass-storage volume.
3. Let every copy finish and safely eject/sync the volume.
4. Press a badge button to commit the update.

The mass-storage volume is a synthetic update disk, not a readable backup of badge RRAM or user data. Do not install a developer-signed bootloader merely to enable readback: the documented developer-mode transition is irreversible and erases provisioned secrets, including light-exchange capability.
