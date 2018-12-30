# About homebridge-unipi-evok
This library provides a homebridge **platform plugin** for the [UniPi](https://unipi.technology) [Neuron](https://www.unipi.technology/products?category=2) series of devices. These open source devices come with a set of supported software, that still requires you to do quite a bit of manual configuration and tweaking.

![UniPi Neuron Device](./static/unipi-neuron.png)
_**Copyright & Source**: [UniPi.technology](https://unipi.technology)_

The purpose of this library is to expose all (or as much as possible) of the default features of a UniPi device as a single HomeKit Accessory with automatically detected services for all of the features.

# State of development (beta)

This is a work in progress, and only available as a beta today. That said, a lot already works:

![Screenshot](./static/screenshot.png)

## Digital inputs
The digital inputs are detected automatically, and exposed as Programmable Stateless Switches. They support **SINGLE**, **DOUBLE** and **LONG** press events, and can be used to trigger automations.

> **Note** : For the double press feature to work properly, you will need to set the debounce value for the digital inputs to a value between 5 and 10. You can do that via the Evok UI, in the Configuration tab. Otherwise, you'll miss a lot of double click events, as the down event won't be seen.

**TODO:** I intend to allow for further configuration, in order to support both stateless and stateful (on/off) switches. 

## Digital outputs
The digital outputs detected automatically, and exposed as switches. They can be reconfigured within the iOS App as lights or fans.

## Relay outputs
The relay outputs are detected automatically, and exposed as switches as well. These can also be reconfigured as lights or fans.

## User leds
The user leds are detected automatically, and exposed as light bulbs with on/off state. I currently use them mainly for testing.

## Reachability
The reachability is set upon successful connection to the Evok API, and upon disconnection.

## Updates to device states
The device states are updated automatically when changed by an external event (for example a user manually using the evok API).

# Installation
Installation is very straightforward, and it is possible to configure more than one Neuron device.

1. Install homebridge globally
```bash
npm -g install homebridge
```

2. Install the plugin globally
```bash
npm -g install homebridge-unipi-evok
```

3. Edit your `~/.homebridge/config.json`, and add a platform in the `platforms` array:
```json
{
  "...": "Collapsed stuff",
  "platforms": [
    {
      "platform": "UniPi",
      "endpoints": [
        {
          "name": "Demo UniPi Neuron M203",
          "host": "m203-s001.local",
          "port": 80,
          "wsPort": 8080
        }
      ]
    }
  ]
}
```
# License & Copyright
The software is released under the [LGPLv3](https://choosealicense.com/licenses/lgpl-3.0/), and copyrighted &copy;2018 by **Daan Kets**.