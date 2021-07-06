---
author: Daan Kets <daankets@blackbit.be>
version: 1.2.1
title: HomeBridge UniPi Plugin for Evok API
---

# Release notes

## 1.2.1
Security hotfix removing vulnerable dependencies

## 1.1.2
This bugfix release fixes a problem with the 'stuck-button' detection, the would prevent the detection counter from being reset on button release.

## 1.1.1
This versions adds a feature for preventing unlimited repeated 'long press' events from firing an event. This feature is handy to prevent unlimited switching on/off of a target device when a button gets stuck. The default value limits the long press repeat to *10*.

> For configuration instructions, see the readme.md

## 1.1.0
This version adds the capability to directly switch outputs (relays or digital) when an input event is raised (single, double or long press), without having to assign one or more rules in HomeKit. It's a bit like the direct switch facility in EVOK.

> For configuration instructions, see the readme.md

This version also fixes an issue when virtual pulse relays were switched by selecting a scene in HomeKit. HomeKit then force-writes the target state of each device, no matter it's current state. It could lead to messed-up states, this is now fixed by preventing a device action if the target state matches the current (virtual) state.

## 1.0.0
Initial release
