# Changelog

All notable changes to this project are documented in this file.

## [0.2.0] - 2026-10-02

### Added
- Sniper rifle weapon with right-click scope toggle: zoomed FOV, slowed look sensitivity, and a circular scope overlay that blurs the surrounding view instead of blacking it out.
- Visible right-handed rifle viewmodel (stock, cheek rest, receiver, trigger guard, bolt handle, scope rings and lenses, muzzle brake, bipod) parented to the camera.
- Real bullet projectiles with swept-ray collision detection, traveling from the muzzle and converging on the exact point the crosshair/scope is aimed at.
- Practice target that takes bullet damage, flashes on hit, breaks into scattering debris at 0 HP, and respawns at a random location on the map.
- Three hostile enemies that chase the player, attack in melee range with a visible knife (stab animation on hit), and deal damage over time.
- Player health system with a HUD health bar, a "YOU DIED" death screen with a live respawn countdown, and automatic respawn at a dedicated spawn platform.
- Desert environment: procedural warm sky, sandy grid-textured ground, and atmospheric haze/fog.
- Jump (Space) with a velocity-integrated arc, and a fixed 5-unit forward slide/dash (C).
- Sniper magazine with an ammo HUD counter that auto-refills instantly when emptied, so the player never has to reload.

## [0.1.0] - 2026-10-02

### Added
- Initial project scaffold: Vite + TypeScript + Babylon.js.
- First-person camera with WASD movement, mouse look, and ground collision.
- Grid-textured ground plane and a basic placeholder target box.
